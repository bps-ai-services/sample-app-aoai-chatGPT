from azure.identity import ClientSecretCredential
from msgraph import GraphServiceClient
import copy
import json
import os
import logging
import uuid
import httpx
from quart import (
    Blueprint,
    Quart,
    jsonify,
    make_response,
    request,
    send_from_directory,
    render_template,
)

from openai import AsyncAzureOpenAI
from azure.identity.aio import (
    DefaultAzureCredential,
    get_bearer_token_provider
)
from backend.auth.auth_utils import get_authenticated_user_details
from backend.security.ms_defender_utils import get_msdefender_user_json
from backend.history.cosmosdbservice import CosmosConversationClient
from backend.settings import (
    app_settings,
    MINIMUM_SUPPORTED_AZURE_OPENAI_PREVIEW_API_VERSION
)
from backend.utils import (
    format_as_ndjson,
    format_stream_response,
    format_non_streaming_response,
    convert_to_pf_format,
    format_pf_non_streaming_response,
)
from backend.prompt_type import PromptType

from azure.monitor.opentelemetry import configure_azure_monitor
from opentelemetry.instrumentation.logging import LoggingInstrumentor
from opentelemetry import trace
from opentelemetry.trace import (
    SpanKind,
    get_tracer_provider,
)
from opentelemetry.propagate import extract

bp = Blueprint("routes", __name__, static_folder="static",
               template_folder="static")


def create_app():
    app = Quart(__name__)
    app.register_blueprint(bp)
    app.config["TEMPLATES_AUTO_RELOAD"] = True
    return app


@bp.route("/")
async def index():
    return await render_template(
        "index.html",
        title=app_settings.ui.title,
        favicon=app_settings.ui.favicon
    )


@bp.route("/favicon.ico")
async def favicon():
    return await bp.send_static_file("favicon.ico")


@bp.route("/assets/<path:path>")
async def assets(path):
    return await send_from_directory("static/assets", path)

# Debug settings
DEBUG = os.environ.get("DEBUG", "false")


# Global variable to track logging initialization
logging_initialized = False


def initialize_logging():
    global logging_initialized
    if not logging_initialized:
        if DEBUG.lower() == "true":
            # Configure Azure Monitor
            configure_azure_monitor(
                connection_string=app_settings.base_settings.applicationinsights_connection_string,
                logger_name="azure_application_logger",
            )
            # Get and configure logger
            logger = logging.getLogger("azure_application_logger")
            logger.setLevel(logging.INFO)

            # Prevent multiple handlers
            if not logger.hasHandlers():
                handler = logging.StreamHandler()  # or another handler suitable for your needs
                formatter = logging.Formatter(
                    '%(asctime)s - %(name)s - %(levelname)s - %(message)s')
                handler.setFormatter(formatter)
                logger.addHandler(handler)

            # Instrument logging with OpenTelemetry
            LoggingInstrumentor().instrument(set_logging_format=True)

            logging_initialized = True
            return logger
        else:
            return None


# Initialize logging once
logger = initialize_logging()


# def initialize_logging():
#     global logging_initialized
#     if not logging_initialized:
#         if DEBUG.lower() == "true":
#             # Configure Azure Monitor
#             configure_azure_monitor(
#                 connection_string=app_insight_conn_key,
#                 logger_name="azure_application_logger",
#             )
#             # Get and configure logger
#             logger = logging.getLogger("azure_application_logger")
#             logger.setLevel(INFO)
#             logging_initialized = True
#             return logger
#         else:
#             return None
#             # # Default logger if not in debug mode
#             # logger = logging.getLogger()
#             # logger.setLevel(logging.INFO)
#             # return logger

# # Initialize logging once
# logger = initialize_logging()


# global logging_initialized
# logging_initialized = False

# if DEBUG.lower() == "true":
#     if not logging_initialized:
#         #logging.basicConfig(level=logging.DEBUG)
#         configure_azure_monitor(
#         connection_string=app_insight_conn_key,
#         logger_name="azure_application_logger",)
#         logging = getLogger("azure_application_logger")
#         logging.setLevel(INFO)

#         logging_initialized = True

tracer = trace.get_tracer(__name__, tracer_provider=get_tracer_provider())


USER_AGENT = "GitHubSampleWebApp/AsyncAzureOpenAI/1.0.0"

# Frontend Settings via Environment Variables
frontend_settings = {
    "auth_enabled": app_settings.base_settings.auth_enabled,
    "feedback_enabled": (
        app_settings.chat_history and
        app_settings.chat_history.enable_feedback
    ),
    "ui": {
        "title": app_settings.ui.title,
        "logo": app_settings.ui.logo,
        "chat_logo": app_settings.ui.chat_logo or app_settings.ui.logo,
        "chat_title": app_settings.ui.chat_title,
        "chat_description": app_settings.ui.chat_description,
        "show_share_button": app_settings.ui.show_share_button,
    },
    "sanitize_answer": app_settings.base_settings.sanitize_answer,
}


# Enable Microsoft Defender for Cloud Integration
MS_DEFENDER_ENABLED = os.environ.get(
    "MS_DEFENDER_ENABLED", "true").lower() == "true"


# Initialize Azure OpenAI Client
def init_openai_client():
    azure_openai_client = None
    try:
        # API version check
        if (
            app_settings.azure_openai.preview_api_version
            < MINIMUM_SUPPORTED_AZURE_OPENAI_PREVIEW_API_VERSION
        ):
            raise ValueError(
                f"The minimum supported Azure OpenAI preview API version is '{MINIMUM_SUPPORTED_AZURE_OPENAI_PREVIEW_API_VERSION}'"
            )

        # Endpoint
        if (
            not app_settings.azure_openai.endpoint and
            not app_settings.azure_openai.resource
        ):
            raise ValueError(
                "AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_RESOURCE is required"
            )

        endpoint = (
            app_settings.azure_openai.endpoint
            if app_settings.azure_openai.endpoint
            else f"https://{app_settings.azure_openai.resource}.openai.azure.com/"
        )

        # Authentication
        aoai_api_key = app_settings.azure_openai.key
        ad_token_provider = None
        if not aoai_api_key:
            logging.debug("No AZURE_OPENAI_KEY found, using Azure AD auth")
            ad_token_provider = get_bearer_token_provider(
                DefaultAzureCredential(), "https://cognitiveservices.azure.com/.default"
            )

        # Deployment
        deployment = app_settings.azure_openai.model
        if not deployment:
            raise ValueError("AZURE_OPENAI_MODEL is required")

        # Default Headers
        default_headers = {"x-ms-useragent": USER_AGENT}

        azure_openai_client = AsyncAzureOpenAI(
            api_version=app_settings.azure_openai.preview_api_version,
            api_key=aoai_api_key,
            azure_ad_token_provider=ad_token_provider,
            default_headers=default_headers,
            azure_endpoint=endpoint,
        )

        return azure_openai_client
    except Exception as e:
        logging.exception("Exception in Azure OpenAI initialization", e)
        azure_openai_client = None
        raise e


def init_cosmosdb_client():
    cosmos_conversation_client = None
    if app_settings.chat_history:
        try:
            cosmos_endpoint = (
                f"https://{app_settings.chat_history.account}.documents.azure.com:443/"
            )

            if not app_settings.chat_history.account_key:
                credential = DefaultAzureCredential()
            else:
                credential = app_settings.chat_history.account_key

            cosmos_conversation_client = CosmosConversationClient(
                cosmosdb_endpoint=cosmos_endpoint,
                credential=credential,
                database_name=app_settings.chat_history.database,
                container_name=app_settings.chat_history.conversations_container,
                enable_message_feedback=app_settings.chat_history.enable_feedback,
            )
        except Exception as e:
            logging.exception("Exception in CosmosDB initialization", e)
            cosmos_conversation_client = None
            raise e
    else:
        logging.debug("CosmosDB not configured")

    return cosmos_conversation_client


def prepare_model_args(request_body, request_headers):
    request_messages = request_body.get("messages", [])
    messages = []
    if not app_settings.datasource:
        messages = [
            {
                "role": "system",
                "content": app_settings.azure_openai.system_message
            }
        ]

    for message in request_messages:
        if message:
            messages.append(
                {
                    "role": message["role"],
                    "content": message["content"]
                }
            )

    user_json = None
    if (MS_DEFENDER_ENABLED):
        authenticated_user_details = get_authenticated_user_details(
            request_headers)
        user_json = get_msdefender_user_json(
            authenticated_user_details, request_headers)

    model_args = {
        "messages": messages,
        "temperature": app_settings.azure_openai.temperature,
        "max_tokens": app_settings.azure_openai.max_tokens,
        "top_p": app_settings.azure_openai.top_p,
        "stop": app_settings.azure_openai.stop_sequence,
        "stream": app_settings.azure_openai.stream,
        "model": app_settings.azure_openai.model,
        "user": user_json
    }

    if app_settings.datasource:
        model_args["extra_body"] = {
            "data_sources": [
                app_settings.datasource.construct_payload_configuration(
                    request=request
                )
            ]
        }

    model_args_clean = copy.deepcopy(model_args)
    if model_args_clean.get("extra_body"):
        secret_params = [
            "key",
            "connection_string",
            "embedding_key",
            "encoded_api_key",
            "api_key",
        ]
        for secret_param in secret_params:
            if model_args_clean["extra_body"]["data_sources"][0]["parameters"].get(
                secret_param
            ):
                model_args_clean["extra_body"]["data_sources"][0]["parameters"][
                    secret_param
                ] = "*****"
        authentication = model_args_clean["extra_body"]["data_sources"][0][
            "parameters"
        ].get("authentication", {})
        for field in authentication:
            if field in secret_params:
                model_args_clean["extra_body"]["data_sources"][0]["parameters"][
                    "authentication"
                ][field] = "*****"
        embeddingDependency = model_args_clean["extra_body"]["data_sources"][0][
            "parameters"
        ].get("embedding_dependency", {})
        if "authentication" in embeddingDependency:
            for field in embeddingDependency["authentication"]:
                if field in secret_params:
                    model_args_clean["extra_body"]["data_sources"][0]["parameters"][
                        "embedding_dependency"
                    ]["authentication"][field] = "*****"

    logging.debug(f"REQUEST BODY: {json.dumps(model_args_clean, indent=4)}")

    return model_args


async def promptflow_request(request):
    try:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {app_settings.promptflow.api_key}",
        }
        # Adding timeout for scenarios where response takes longer to come back
        logging.debug(
            f"Setting timeout to {app_settings.promptflow.response_timeout}")
        async with httpx.AsyncClient(
            timeout=float(app_settings.promptflow.response_timeout)
        ) as client:
            pf_formatted_obj = convert_to_pf_format(
                request,
                app_settings.promptflow.request_field_name,
                app_settings.promptflow.response_field_name
            )
            # NOTE: This only support question and chat_history parameters
            # If you need to add more parameters, you need to modify the request body
            response = await client.post(
                app_settings.promptflow.endpoint,
                json={
                    app_settings.promptflow.request_field_name: pf_formatted_obj[-1]["inputs"][app_settings.promptflow.request_field_name],
                    "chat_history": pf_formatted_obj[:-1],
                },
                headers=headers,
            )
        resp = response.json()
        resp["id"] = request["messages"][-1]["id"]
        return resp
    except Exception as e:
        logging.error(
            f"An error occurred while making promptflow_request: {e}")


async def send_chat_request(request_body, request_headers):
    filtered_messages = []
    messages = request_body.get("messages", [])
    for message in messages:
        if message.get("role") != 'tool':
            filtered_messages.append(message)

    request_body['messages'] = filtered_messages
    model_args = prepare_model_args(request_body, request_headers)

    try:
        azure_openai_client = init_openai_client()
        raw_response = await azure_openai_client.chat.completions.with_raw_response.create(**model_args)
        response = raw_response.parse()
        apim_request_id = raw_response.headers.get("apim-request-id")
    except Exception as e:
        logging.exception("Exception in send_chat_request")
        raise e

    return response, apim_request_id


async def complete_chat_request(request_body, request_headers):
    if app_settings.base_settings.use_promptflow:
        response = await promptflow_request(request_body)
        history_metadata = request_body.get("history_metadata", {})
        return format_pf_non_streaming_response(
            response,
            history_metadata,
            app_settings.promptflow.response_field_name,
            app_settings.promptflow.citations_field_name
        )
    else:
        response, apim_request_id = await send_chat_request(request_body, request_headers)
        history_metadata = request_body.get("history_metadata", {})
        return format_non_streaming_response(response, history_metadata, apim_request_id)


async def stream_chat_request(request_body, request_headers):
    response, apim_request_id = await send_chat_request(request_body, request_headers)
    history_metadata = request_body.get("history_metadata", {})

    async def generate():
        async for completionChunk in response:
            yield format_stream_response(completionChunk, history_metadata, apim_request_id)

    return generate()


async def conversation_internal(request_body, request_headers):
    try:
        if app_settings.azure_openai.stream:
            result = await stream_chat_request(request_body, request_headers)
            response = await make_response(format_as_ndjson(result))
            response.timeout = None
            response.mimetype = "application/json-lines"
            return response
        else:
            result = await complete_chat_request(request_body, request_headers)
            return jsonify(result)

    except Exception as ex:
        logging.exception(ex)
        if hasattr(ex, "status_code"):
            return jsonify({"error": str(ex)}), ex.status_code
        else:
            return jsonify({"error": str(ex)}), 500


@bp.route("/conversation", methods=["POST"])
async def conversation():
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    request_json = await request.get_json()

    return await conversation_internal(request_json, request.headers)


@bp.route("/frontend_settings", methods=["GET"])
def get_frontend_settings():
    try:
        return jsonify(frontend_settings), 200
    except Exception as e:
        logging.exception("Exception in /frontend_settings")
        return jsonify({"error": str(e)}), 500


## Conversation History API ##
@bp.route("/history/generate", methods=["POST"])
async def add_conversation():
    authenticated_user = get_authenticated_user_details(
        request_headers=request.headers)
    user_id = authenticated_user["user_principal_id"]

    # check request for conversation_id
    request_json = await request.get_json()
    conversation_id = request_json.get("conversation_id", None)

    try:
        # make sure cosmos is configured
        cosmos_conversation_client = init_cosmosdb_client()
        if not cosmos_conversation_client:
            raise Exception("CosmosDB is not configured or not working")

        # check for the conversation_id, if the conversation is not set, we will create a new one
        history_metadata = {}
        if not conversation_id:
            title = await generate_title(request_json["messages"])
            conversation_dict = await cosmos_conversation_client.create_conversation(
                user_id=user_id, title=title
            )
            conversation_id = conversation_dict["id"]
            history_metadata["title"] = title
            history_metadata["date"] = conversation_dict["createdAt"]

        # Format the incoming message object in the "chat/completions" messages format
        # then write it to the conversation history in cosmos
        messages = request_json["messages"]
        if len(messages) > 0 and messages[-1]["role"] == "user":
            createdMessageValue = await cosmos_conversation_client.create_message(
                uuid=str(uuid.uuid4()),
                conversation_id=conversation_id,
                user_id=user_id,
                input_message=messages[-1],
            )
            if createdMessageValue == "Conversation not found":
                raise Exception(
                    "Conversation not found for the given conversation ID: "
                    + conversation_id
                    + "."
                )
        else:
            raise Exception("No user message found")

        await cosmos_conversation_client.cosmosdb_client.close()

        # Submit request to Chat Completions for response
        request_body = await request.get_json()
        history_metadata["conversation_id"] = conversation_id
        request_body["history_metadata"] = history_metadata
        return await conversation_internal(request_body, request.headers)

    except Exception as e:
        logging.exception("Exception in /history/generate")
        return jsonify({"error": str(e)}), 500


@bp.route("/history/update", methods=["POST"])
async def update_conversation():
    authenticated_user = get_authenticated_user_details(
        request_headers=request.headers)
    user_id = authenticated_user["user_principal_id"]

    # check request for conversation_id
    request_json = await request.get_json()
    conversation_id = request_json.get("conversation_id", None)

    with tracer.start_as_current_span("/history/update", context=extract(request.headers), kind=SpanKind.SERVER):
        try:
            logger.info("Calling initiating - /history/update")

            # make sure cosmos is configured
            cosmos_conversation_client = init_cosmosdb_client()
            if not cosmos_conversation_client:
                raise Exception("CosmosDB is not configured or not working")

            # check for the conversation_id, if the conversation is not set, we will create a new one
            if not conversation_id:
                raise Exception("No conversation_id found")

            # Format the incoming message object in the "chat/completions" messages format
            # then write it to the conversation history in cosmos
            messages = request_json["messages"]
            if len(messages) > 0 and messages[-1]["role"] == "assistant":
                if len(messages) > 1 and messages[-2].get("role", None) == "tool":
                    # write the tool message first
                    await cosmos_conversation_client.create_message(
                        uuid=str(uuid.uuid4()),
                        conversation_id=conversation_id,
                        user_id=user_id,
                        input_message=messages[-2],
                    )
                # write the assistant message
                await cosmos_conversation_client.create_message(
                    uuid=messages[-1]["id"],
                    conversation_id=conversation_id,
                    user_id=user_id,
                    input_message=messages[-1],
                )
            else:
                raise Exception("No bot messages found")

            # Submit request to Chat Completions for response
            await cosmos_conversation_client.cosmosdb_client.close()
            response = {"success": True}
            logger.info("Calling Completed - /history/update")
            return jsonify(response), 200

        except Exception as e:
            # logging.exception("Exception in /history/update")
            logger.error(f"An error occurred in /history/update : {e}")
            return jsonify({"error": str(e)}), 500


@bp.route("/history/message_feedback", methods=["POST"])
async def update_message():
    authenticated_user = get_authenticated_user_details(
        request_headers=request.headers)
    user_id = authenticated_user["user_principal_id"]
    cosmos_conversation_client = init_cosmosdb_client()

    # check request for message_id
    request_json = await request.get_json()
    message_id = request_json.get("message_id", None)
    message_feedback = request_json.get("message_feedback", None)
    try:
        if not message_id:
            return jsonify({"error": "message_id is required"}), 400

        if not message_feedback:
            return jsonify({"error": "message_feedback is required"}), 400

        # update the message in cosmos
        updated_message = await cosmos_conversation_client.update_message_feedback(
            user_id, message_id, message_feedback
        )
        if updated_message:
            return (
                jsonify(
                    {
                        "message": f"Successfully updated message with feedback {message_feedback}",
                        "message_id": message_id,
                    }
                ),
                200,
            )
        else:
            return (
                jsonify(
                    {
                        "error": f"Unable to update message {message_id}. It either does not exist or the user does not have access to it."
                    }
                ),
                404,
            )

    except Exception as e:
        # logging.exception("Exception in /history/message_feedback")
        logging.error(f"An error occurred in /history/message_feedback : {e}")
        return jsonify({"error": str(e)}), 500


@bp.route("/history/delete", methods=["DELETE"])
async def delete_conversation():
    # get the user id from the request headers
    authenticated_user = get_authenticated_user_details(
        request_headers=request.headers)
    user_id = authenticated_user["user_principal_id"]

    # check request for conversation_id
    request_json = await request.get_json()
    conversation_id = request_json.get("conversation_id", None)

    try:
        if not conversation_id:
            return jsonify({"error": "conversation_id is required"}), 400

        # make sure cosmos is configured
        cosmos_conversation_client = init_cosmosdb_client()
        if not cosmos_conversation_client:
            raise Exception("CosmosDB is not configured or not working")

        # delete the conversation messages from cosmos first
        deleted_messages = await cosmos_conversation_client.delete_messages(
            conversation_id, user_id
        )

        # Now delete the conversation
        deleted_conversation = await cosmos_conversation_client.delete_conversation(
            user_id, conversation_id
        )

        await cosmos_conversation_client.cosmosdb_client.close()

        return (
            jsonify(
                {
                    "message": "Successfully deleted conversation and messages",
                    "conversation_id": conversation_id,
                }
            ),
            200,
        )
    except Exception as e:
        logging.exception("Exception in /history/delete")
        return jsonify({"error": str(e)}), 500


@bp.route("/history/list", methods=["GET"])
async def list_conversations():
    offset = request.args.get("offset", 0)
    authenticated_user = get_authenticated_user_details(
        request_headers=request.headers)
    user_id = authenticated_user["user_principal_id"]

    # make sure cosmos is configured
    cosmos_conversation_client = init_cosmosdb_client()
    if not cosmos_conversation_client:
        raise Exception("CosmosDB is not configured or not working")

    # get the conversations from cosmos
    conversations = await cosmos_conversation_client.get_conversations(
        user_id, offset=offset, limit=25
    )
    await cosmos_conversation_client.cosmosdb_client.close()
    if not isinstance(conversations, list):
        return jsonify({"error": f"No conversations for {user_id} were found"}), 404

    # return the conversation ids

    return jsonify(conversations), 200


@bp.route("/history/read", methods=["POST"])
async def get_conversation():
    authenticated_user = get_authenticated_user_details(
        request_headers=request.headers)
    user_id = authenticated_user["user_principal_id"]

    # check request for conversation_id
    request_json = await request.get_json()
    conversation_id = request_json.get("conversation_id", None)

    if not conversation_id:
        return jsonify({"error": "conversation_id is required"}), 400

    # make sure cosmos is configured
    cosmos_conversation_client = init_cosmosdb_client()
    if not cosmos_conversation_client:
        raise Exception("CosmosDB is not configured or not working")

    # get the conversation object and the related messages from cosmos
    conversation = await cosmos_conversation_client.get_conversation(
        user_id, conversation_id
    )
    # return the conversation id and the messages in the bot frontend format
    if not conversation:
        return (
            jsonify(
                {
                    "error": f"Conversation {conversation_id} was not found. It either does not exist or the logged in user does not have access to it."
                }
            ),
            404,
        )

    # get the messages for the conversation from cosmos
    conversation_messages = await cosmos_conversation_client.get_messages(
        user_id, conversation_id
    )

    # format the messages in the bot frontend format
    messages = [
        {
            "id": msg["id"],
            "role": msg["role"],
            "content": msg["content"],
            "createdAt": msg["createdAt"],
            "feedback": msg.get("feedback"),
        }
        for msg in conversation_messages
    ]

    await cosmos_conversation_client.cosmosdb_client.close()
    return jsonify({"conversation_id": conversation_id, "messages": messages}), 200


@bp.route("/history/rename", methods=["POST"])
async def rename_conversation():
    authenticated_user = get_authenticated_user_details(
        request_headers=request.headers)
    user_id = authenticated_user["user_principal_id"]

    # check request for conversation_id
    request_json = await request.get_json()
    conversation_id = request_json.get("conversation_id", None)

    if not conversation_id:
        return jsonify({"error": "conversation_id is required"}), 400

    # make sure cosmos is configured
    cosmos_conversation_client = init_cosmosdb_client()
    if not cosmos_conversation_client:
        raise Exception("CosmosDB is not configured or not working")

    # get the conversation from cosmos
    conversation = await cosmos_conversation_client.get_conversation(
        user_id, conversation_id
    )
    if not conversation:
        return (
            jsonify(
                {
                    "error": f"Conversation {conversation_id} was not found. It either does not exist or the logged in user does not have access to it."
                }
            ),
            404,
        )

    # update the title
    title = request_json.get("title", None)
    if not title:
        return jsonify({"error": "title is required"}), 400
    conversation["title"] = title
    updated_conversation = await cosmos_conversation_client.upsert_conversation(
        conversation
    )

    await cosmos_conversation_client.cosmosdb_client.close()
    return jsonify(updated_conversation), 200


@bp.route("/history/delete_all", methods=["DELETE"])
async def delete_all_conversations():
    # get the user id from the request headers
    authenticated_user = get_authenticated_user_details(
        request_headers=request.headers)
    user_id = authenticated_user["user_principal_id"]

    # get conversations for user
    try:
        # make sure cosmos is configured
        cosmos_conversation_client = init_cosmosdb_client()
        if not cosmos_conversation_client:
            raise Exception("CosmosDB is not configured or not working")

        conversations = await cosmos_conversation_client.get_conversations(
            user_id, offset=0, limit=None
        )
        if not conversations:
            return jsonify({"error": f"No conversations for {user_id} were found"}), 404

        # delete each conversation
        for conversation in conversations:
            # delete the conversation messages from cosmos first
            deleted_messages = await cosmos_conversation_client.delete_messages(
                conversation["id"], user_id
            )

            # Now delete the conversation
            deleted_conversation = await cosmos_conversation_client.delete_conversation(
                user_id, conversation["id"]
            )
        await cosmos_conversation_client.cosmosdb_client.close()
        return (
            jsonify(
                {
                    "message": f"Successfully deleted conversation and messages for user {user_id}"
                }
            ),
            200,
        )

    except Exception as e:
        logging.exception("Exception in /history/delete_all")
        return jsonify({"error": str(e)}), 500


@bp.route("/history/clear", methods=["POST"])
async def clear_messages():
    # get the user id from the request headers
    authenticated_user = get_authenticated_user_details(
        request_headers=request.headers)
    user_id = authenticated_user["user_principal_id"]

    # check request for conversation_id
    request_json = await request.get_json()
    conversation_id = request_json.get("conversation_id", None)

    try:
        if not conversation_id:
            return jsonify({"error": "conversation_id is required"}), 400

        # make sure cosmos is configured
        cosmos_conversation_client = init_cosmosdb_client()
        if not cosmos_conversation_client:
            raise Exception("CosmosDB is not configured or not working")

        # delete the conversation messages from cosmos
        deleted_messages = await cosmos_conversation_client.delete_messages(
            conversation_id, user_id
        )

        return (
            jsonify(
                {
                    "message": "Successfully deleted messages in conversation",
                    "conversation_id": conversation_id,
                }
            ),
            200,
        )
    except Exception as e:
        logging.exception("Exception in /history/clear_messages")
        return jsonify({"error": str(e)}), 500


@bp.route("/history/ensure", methods=["GET"])
async def ensure_cosmos():
    # log app_settings object with some text
    logging.debug("app_settings object: %s", app_settings)

    if not app_settings.chat_history:
        return jsonify({"error": "CosmosDB is not configured"}), 404

    try:
        cosmos_conversation_client = init_cosmosdb_client()
        success, err = await cosmos_conversation_client.ensure()
        if not cosmos_conversation_client or not success:
            if err:
                return jsonify({"error": err}), 422
            return jsonify({"error": "CosmosDB is not configured or not working"}), 500

        await cosmos_conversation_client.cosmosdb_client.close()
        return jsonify({"message": "CosmosDB is configured and working"}), 200
    except Exception as e:
        logging.exception("Exception in /history/ensure")
        cosmos_exception = str(e)
        if "Invalid credentials" in cosmos_exception:
            return jsonify({"error": cosmos_exception}), 401
        elif "Invalid CosmosDB database name" in cosmos_exception:
            return (
                jsonify(
                    {
                        "error": f"{cosmos_exception} {app_settings.chat_history.database} for account {app_settings.chat_history.account}"
                    }
                ),
                422,
            )
        elif "Invalid CosmosDB container name" in cosmos_exception:
            return (
                jsonify(
                    {
                        "error": f"{cosmos_exception}: {app_settings.chat_history.conversations_container}"
                    }
                ),
                422,
            )
        else:
            return jsonify({"error": "CosmosDB is not working"}), 500


async def generate_title(conversation_messages):
    # make sure the messages are sorted by _ts descending
    title_prompt = 'Summarize the conversation so far into a 4-word or less title. Do not use any quotation marks or punctuation. Respond with a json object in the format {{"title": string}}. Do not include any other commentary or description.'

    messages = [
        {"role": msg["role"], "content": msg["content"]}
        for msg in conversation_messages
    ]
    messages.append({"role": "user", "content": title_prompt})

    try:
        azure_openai_client = init_openai_client(use_data=False)
        response = await azure_openai_client.chat.completions.create(
            model=app_settings.azure_openai.model, messages=messages, temperature=1, max_tokens=64
        )

        title = json.loads(response.choices[0].message.content)["title"]
        return title
    except Exception as e:
        return messages[-2]["content"]

################################################################################
# Boat Functions


def prepare_model_args_for_intent(request_body, request_headers):
    intent_prompt = """
    You are an AI that classifies user questions based on their intent. When the user asks a question, respond only with one of the following options that best matches the intent of the question, and nothing else:

    BOAT_SUGGESTION_PROMPT: Use this when the user is asking for recommendations or suggestions about boats.
    Example: "What boat would you recommend for a family of four?"

    VALUE_PROPOSITION_PROMPT: Use this when the user is asking about the benefits, features, or value of a particular boat or service.
    Example 1: "What are the advantages of buying this model?"
    Example 2: "What are the features of the tahoe?"

    BOAT_WALKAROUND_PROMPT: Only use this when the user is EXPLICITLY asking for a detailed tour or description of a boat's features and layout.
    Example: "Can you give me a walkthrough of the new yacht model?"

    OTHER_PROMPT: Use this for any other type of question that does not fit into the above categories.
    Example: "What is the weather like today?"

    If the question fits multiple categories, default to OTHER_PROMPT

    Do not provide any additional information, explanations, or responses beyond these options.
    """

    request_messages = request_body.get("messages", [])
    messages = []
    if not app_settings.datasource:
        messages = [
            {
                "role": "system",
                "content": intent_prompt
            }
        ]

    # get the last message that has the user role
    last_user_message = None
    for message in reversed(request_messages):
        if message.get("role") == "user":
            last_user_message = message
            break

    if last_user_message:
        messages.append({
            "role": last_user_message["role"],
            "content": last_user_message["content"]
        })
    else:
        messages.append(
            {
                "role": "user",
                "content": "default prompt"
            }
        )

    user_json = None
    if (MS_DEFENDER_ENABLED):
        authenticated_user_details = get_authenticated_user_details(
            request_headers)
        user_json = get_msdefender_user_json(
            authenticated_user_details, request_headers)

    model_args = {
        "messages": messages,
        "temperature": app_settings.azure_openai.temperature,
        "max_tokens": app_settings.azure_openai.max_tokens,
        "top_p": app_settings.azure_openai.top_p,
        "stop": app_settings.azure_openai.stop_sequence,
        "stream": app_settings.azure_openai.stream,
        "model": app_settings.azure_openai.model,
        "user": user_json
    }

    if app_settings.datasource:
        model_args["extra_body"] = {
            "data_sources": [
                app_settings.datasource.construct_payload_configuration(
                    request=request
                )
            ]
        }

    model_args_clean = copy.deepcopy(model_args)
    if model_args_clean.get("extra_body"):
        secret_params = [
            "key",
            "connection_string",
            "embedding_key",
            "encoded_api_key",
            "api_key",
        ]
        for secret_param in secret_params:
            if model_args_clean["extra_body"]["data_sources"][0]["parameters"].get(
                secret_param
            ):
                model_args_clean["extra_body"]["data_sources"][0]["parameters"][
                    secret_param
                ] = "*****"
        authentication = model_args_clean["extra_body"]["data_sources"][0][
            "parameters"
        ].get("authentication", {})
        for field in authentication:
            if field in secret_params:
                model_args_clean["extra_body"]["data_sources"][0]["parameters"][
                    "authentication"
                ][field] = "*****"
        embeddingDependency = model_args_clean["extra_body"]["data_sources"][0][
            "parameters"
        ].get("embedding_dependency", {})
        if "authentication" in embeddingDependency:
            for field in embeddingDependency["authentication"]:
                if field in secret_params:
                    model_args_clean["extra_body"]["data_sources"][0]["parameters"][
                        "embedding_dependency"
                    ]["authentication"][field] = "*****"

    logging.debug(f"REQUEST BODY: {json.dumps(model_args_clean, indent=4)}")

    return model_args


async def send_chat_request_v2(request_body, request_headers):
    filtered_messages = []
    messages = request_body.get("messages", [])
    for message in messages:
        if message.get("role") != 'tool':
            filtered_messages.append(message)

    request_body['messages'] = filtered_messages
    model_args = prepare_model_args(request_body, request_headers)

    try:
        azure_openai_client = init_openai_client()
        raw_response = await azure_openai_client.chat.completions.with_raw_response.create(**model_args)
        response = raw_response.parse()
        apim_request_id = raw_response.headers.get("apim-request-id")
    except Exception as e:
        logging.exception("Exception in send_chat_request")
        raise e

    return response, apim_request_id


async def send_chat_intent_request(request_body, request_headers):
    filtered_messages = []
    messages = request_body.get("messages", [])
    for message in messages:
        if message.get("role") != 'tool':
            filtered_messages.append(message)

    request_body['messages'] = filtered_messages
    model_args = prepare_model_args_for_intent(request_body, request_headers)

    try:
        azure_openai_client = init_openai_client()
        raw_response = await azure_openai_client.chat.completions.with_raw_response.create(**model_args)
        response = raw_response.parse()
        apim_request_id = raw_response.headers.get("apim-request-id")
    except Exception as e:
        logging.exception("Exception in send_chat_request")
        raise e

    return response, apim_request_id


async def promptflow_request_v2(request, endpoint, key):
    try:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        }
        # Adding timeout for scenarios where response takes longer to come back
        logging.debug(
            f"Setting timeout to {app_settings.promptflow.response_timeout}")
        async with httpx.AsyncClient(
            timeout=float(app_settings.promptflow.response_timeout)
        ) as client:
            pf_formatted_obj = convert_to_pf_format(
                request,
                app_settings.promptflow.request_field_name,
                app_settings.promptflow.response_field_name
            )
            # NOTE: This only support question and chat_history parameters
            # If you need to add more parameters, you need to modify the request body
            response = await client.post(
                endpoint,
                json={
                    app_settings.promptflow.request_field_name: pf_formatted_obj[-1]["inputs"][app_settings.promptflow.request_field_name],
                    "chat_history": pf_formatted_obj[:-1],
                },
                headers=headers,
            )
        resp = response.json()
        resp["id"] = request["messages"][-1]["id"]
        return resp
    except Exception as e:
        logging.error(
            f"An error occurred while making promptflow_request_v2: {e}")


def get_promptflow_endpoint(prompt_type: PromptType):
    if prompt_type == PromptType.BOAT_SUGGESTION_PROMPT:
        return app_settings.promptflow.endpoint_boat_suggestion_prompt
    elif prompt_type == PromptType.VALUE_PROPOSITION_PROMPT:
        return app_settings.promptflow.endpoint_value_proposition_prompt
    elif prompt_type == PromptType.BOAT_WALKAROUND_PROMPT:
        return app_settings.promptflow.endpoint_boat_walkaround_prompt
    else:
        return app_settings.promptflow.endpoint


def get_promptflow_endpoint_key(prompt_type: PromptType):
    if prompt_type == PromptType.BOAT_SUGGESTION_PROMPT:
        return app_settings.promptflow.boat_suggestion_ep_key
    elif prompt_type == PromptType.VALUE_PROPOSITION_PROMPT:
        return app_settings.promptflow.value_proposition_ep_key
    elif prompt_type == PromptType.BOAT_WALKAROUND_PROMPT:
        return app_settings.promptflow.boat_walkaround_ep_key
    else:
        return app_settings.promptflow.api_key


def get_prompt_type(intent_response):
    try:
        if intent_response.choices:
            for choice in intent_response.choices:
                if choice.message:
                    if choice.message.role == "assistant":
                        content = choice.message.content
                        if "BOAT_SUGGESTION_PROMPT" in content:
                            return PromptType.BOAT_SUGGESTION_PROMPT
                        elif "VALUE_PROPOSITION_PROMPT" in content:
                            return PromptType.VALUE_PROPOSITION_PROMPT
                        elif "BOAT_WALKAROUND_PROMPT" in content:
                            return PromptType.BOAT_WALKAROUND_PROMPT
    except Exception as e:
        logging.exception("Exception in get_prompt_type")

    return PromptType.DEFAULT_PROMPT


async def complete_chat_request_v2(request_body, request_headers):
    if app_settings.base_settings.use_promptflow:
        intent_response, apim_request_id = await send_chat_intent_request(request_body, request_headers)
        prompt_type = get_prompt_type(intent_response)
        history_metadata = request_body.get("history_metadata", {})

        logging.debug(f"Intent Response: {intent_response}")
        logging.debug(f"Prompt Type: {prompt_type}")

        error_json_obj = {
            "title": "Sorry, I cannot help with this request. Please try again.",
            "subtitle": "Sorry, I cannot help with this request. Please try again."
        }

        error_json = json.dumps(error_json_obj)

        # return a "cannot help" response if type is other
        if prompt_type == PromptType.DEFAULT_PROMPT:
            error_response = {
                "id": intent_response.id,
                "model": intent_response.model,
                "created": intent_response.created,
                "choices": [{"messages": [{"role": "assistant", "content": error_json}]}],
                "object": intent_response.object,
                "history_metadata": history_metadata,
                "apim_request_id": apim_request_id
            }
            return error_response

        endpoint = get_promptflow_endpoint(prompt_type)
        key = get_promptflow_endpoint_key(prompt_type)

        logging.debug(f"Promptflow Endpoint: {endpoint}")

        response = await promptflow_request_v2(request_body, endpoint, key)

        return format_pf_non_streaming_response(
            response,
            history_metadata,
            app_settings.promptflow.response_field_name,
            app_settings.promptflow.citations_field_name
        )
    else:
        response, apim_request_id = await send_chat_request_v2(request_body, request_headers)
        history_metadata = request_body.get("history_metadata", {})
        return format_non_streaming_response(response, history_metadata, apim_request_id)


async def conversation_internal_v2(request_body, request_headers):
    try:
        if app_settings.azure_openai.stream:
            result = await stream_chat_request(request_body, request_headers)
            response = await make_response(format_as_ndjson(result))
            response.timeout = None
            response.mimetype = "application/json-lines"
            return response
        else:
            result = await complete_chat_request_v2(request_body, request_headers)
            return jsonify(result)

    except Exception as ex:
        logging.exception(ex)
        if hasattr(ex, "status_code"):
            return jsonify({"error": str(ex)}), ex.status_code
        else:
            return jsonify({"error": str(ex)}), 500

## Conversation History API V2 ##


@bp.route("/v2/history/generate", methods=["POST"])
async def add_conversation_v2():
    authenticated_user = get_authenticated_user_details(
        request_headers=request.headers)
    user_id = authenticated_user["user_principal_id"]

    # check request for conversation_id
    request_json = await request.get_json()
    conversation_id = request_json.get("conversation_id", None)

    try:
        # make sure cosmos is configured
        cosmos_conversation_client = init_cosmosdb_client()
        if not cosmos_conversation_client:
            raise Exception("CosmosDB is not configured or not working")

        # check for the conversation_id, if the conversation is not set, we will create a new one
        history_metadata = {}
        if not conversation_id:
            title = await generate_title(request_json["messages"])
            conversation_dict = await cosmos_conversation_client.create_conversation(
                user_id=user_id, title=title
            )
            conversation_id = conversation_dict["id"]
            history_metadata["title"] = title
            history_metadata["date"] = conversation_dict["createdAt"]

        # Format the incoming message object in the "chat/completions" messages format
        # then write it to the conversation history in cosmos
        messages = request_json["messages"]
        if len(messages) > 0 and messages[-1]["role"] == "user":
            createdMessageValue = await cosmos_conversation_client.create_message(
                uuid=str(uuid.uuid4()),
                conversation_id=conversation_id,
                user_id=user_id,
                input_message=messages[-1],
            )
            if createdMessageValue == "Conversation not found":
                raise Exception(
                    "Conversation not found for the given conversation ID: "
                    + conversation_id
                    + "."
                )
        else:
            raise Exception("No user message found")

        await cosmos_conversation_client.cosmosdb_client.close()

        # Submit request to Chat Completions for response
        request_body = await request.get_json()
        history_metadata["conversation_id"] = conversation_id
        request_body["history_metadata"] = history_metadata
        return await conversation_internal_v2(request_body, request.headers)

    except Exception as e:
        logging.exception("Exception in /v2/history/generate")
        return jsonify({"error": str(e)}), 500


@bp.route("/v2/conversation", methods=["POST"])
async def conversation_v2():
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    request_json = await request.get_json()

    return await conversation_internal_v2(request_json, request.headers, PromptType.BOAT_SUGGESTION_PROMPT)


@bp.route("/history/conversation_feedback", methods=["POST"])
async def add_conversation_feedback():
    authenticated_user = get_authenticated_user_details(
        request_headers=request.headers)
    user_id = authenticated_user["user_principal_id"]
    cosmos_conversation_client = init_cosmosdb_client()

    # check request for message_id
    request_json = await request.get_json()
    conversation_id = request_json.get("conversation_id", None)
    conversation_feedback = request_json.get("conversation_feedback", None)
    try:
        if not conversation_id:
            return jsonify({"error": "conversation_id is required"}), 400

        if not conversation_feedback:
            return jsonify({"error": "conversation_feedback is required"}), 400

        # update the message in cosmos
        updated_conversation = await cosmos_conversation_client.update_conversation_feedback(
            user_id, conversation_id, conversation_feedback
        )
        if updated_conversation:
            return (
                jsonify(
                    {
                        "message": f"Successfully updated conversation with feedback {conversation_feedback}",
                        "message_id": conversation_id,
                    }
                ),
                200,
            )
        else:
            return (
                jsonify(
                    {
                        "error": f"Unable to update conversation {conversation_id}. It either does not exist or the user does not have access to it."
                    }
                ),
                404,
            )

    except Exception as e:
        logging.exception("Exception in /history/conversation_feedback")
        return jsonify({"error": str(e)}), 500


# - Asif Raza m
# API - Promptflow

## Conversation History API V3 ##
@bp.route("/v3/history/generate", methods=["POST"])
async def add_conversation_v3():
    authenticated_user = get_authenticated_user_details(
        request_headers=request.headers)
    user_id = authenticated_user["user_principal_id"]

    # check request for conversation_id
    request_json = await request.get_json()
    # conversation_id = request_json.get("conversation_id", None)
    conversation_id = request_json['messages'][0].get("conversation_id", None)

    with tracer.start_as_current_span("/v3/history/generate", context=extract(request.headers), kind=SpanKind.SERVER):
        try:
            logger.info("Calling initiating - /v3/history/generate")

            # make sure cosmos is configured
            cosmos_conversation_client = init_cosmosdb_client()
            if not cosmos_conversation_client:
                raise Exception("CosmosDB is not configured or not working")

            # check for the conversation_id, if the conversation is not set, we will create a new one
            history_metadata = {}
            if not conversation_id:
                title = await generate_title(request_json["messages"])
                state = request_json['messages'][0].get("state", None)
                city = request_json['messages'][0].get("city", None)
                tags = request_json['messages'][0].get("tags", None)

                conversation_dict = await cosmos_conversation_client.create_conversation(
                    user_id=user_id, title=title, state=state, city=city, tags=tags
                )

                conversation_id = conversation_dict["id"]
                history_metadata["title"] = title
                history_metadata["date"] = conversation_dict["createdAt"]

            # Format the incoming message object in the "chat/completions" messages format
            # then write it to the conversation history in cosmos
            messages = request_json["messages"]
            if len(messages) > 0 and messages[-1]["role"] == "user":
                createdMessageValue = await cosmos_conversation_client.create_message(
                    uuid=str(uuid.uuid4()),
                    conversation_id=conversation_id,
                    user_id=user_id,
                    input_message=messages[-1]
                )
                if createdMessageValue == "Conversation not found":
                    raise Exception(
                        "Conversation not found for the given conversation ID: "
                        + conversation_id
                        + "."
                    )
            else:
                raise Exception("No user message found")

            await cosmos_conversation_client.cosmosdb_client.close()

            # Submit request to Chat Completions for response
            request_body = await request.get_json()
            history_metadata["conversation_id"] = conversation_id
            # request_body["history_metadata"] = history_metadata
            request_body["id"] = conversation_id

            logger.info("Calling Completing - /v3/history/generate")
            return await conversation_internal_v3(request_body, request.headers)

        except Exception as e:
            # logging.exception("Exception in /v3/history/generate")
            logger.error(f"An error occurred in /v3/history/generate : {e}")
            return jsonify({"error": str(e)}), 500


@bp.route("/v3/conversation", methods=["POST"])
async def conversation_v3():
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    request_json = await request.get_json()

    # return await conversation_internal_v3(request_json, request.headers, PromptType.BOAT_SUGGESTION_PROMPT)
    return await conversation_internal_v3(request_json, request.headers)


async def conversation_internal_v3(request_body, request_headers):
    try:
        if app_settings.azure_openai.stream:
            result = await stream_chat_request(request_body, request_headers)
            response = await make_response(format_as_ndjson(result))
            response.timeout = None
            response.mimetype = "application/json-lines"
            return response
        else:
            result = await complete_chat_request_v3(request_body, request_headers)
            result['id'] = request_body['id']
            return jsonify(result)

    except Exception as e:
        # logging.exception(ex)
        logger.error(f"An error occurred in conversation_internal_v3 : {e}")
        if hasattr(e, "status_code"):
            return jsonify({"error": str(e)}), e.status_code
        else:
            return jsonify({"error": str(e)}), 500


async def complete_chat_request_v3(request_body, request_headers):

    if app_settings.base_settings.use_promptflow:

        prompt_type = get_prompt_type(request_body)
        history_metadata = request_body.get("history_metadata", {})

        logger.info(f"Prompt Type: {prompt_type}")

        endpoint = get_promptflow_endpoint(prompt_type)
        key = get_promptflow_endpoint_key(prompt_type)

        logger.info(f"Promptflow Endpoint: {endpoint}")

        response = await promptflow_request_v3(request_body, endpoint, key)

        return format_pf_non_streaming_response(
            response,
            history_metadata,
            app_settings.promptflow.response_field_name,
            app_settings.promptflow.citations_field_name
        )
    else:
        response, apim_request_id = await send_chat_request_v3(request_body, request_headers)
        history_metadata = request_body.get("history_metadata", {})
        return format_non_streaming_response(response, history_metadata, apim_request_id)


def get_prompt_type(request_body):
    try:
        p = request_body.get("messages", {})
        p_type = p[0]['prompt_type']

        if p_type == 1:
            return PromptType.BOAT_SUGGESTION_PROMPT
        elif p_type == 2:
            return PromptType.VALUE_PROPOSITION_PROMPT
        elif p_type == 3:
            return PromptType.BOAT_WALKAROUND_PROMPT
        else:
            return PromptType.DEFAULT_PROMPT

    except Exception as e:
        # logging.exception("Exception in get_prompt_type")
        logger.error(f"Exception in get_prompt_type : {e}")


async def promptflow_request_v3(request, endpoint, key):
    try:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        }
        # Adding timeout for scenarios where response takes longer to come back
        logging.debug(
            f"Setting timeout to {app_settings.promptflow.response_timeout}")
        async with httpx.AsyncClient(
            timeout=float(app_settings.promptflow.response_timeout)
        ) as client:
            pf_formatted_obj = convert_to_pf_format(
                request,
                app_settings.promptflow.request_field_name,
                app_settings.promptflow.response_field_name
            )
            # NOTE: This only support question and chat_history parameters
            # If you need to add more parameters, you need to modify the request body
            response = await client.post(
                endpoint,
                json={
                    app_settings.promptflow.request_field_name: pf_formatted_obj[-1]["inputs"][app_settings.promptflow.request_field_name],
                    "chat_history": pf_formatted_obj[:-1],
                },
                headers=headers,
            )
        resp = response.json()
        # resp["id"] = request["messages"][-1]["id"]
        return resp
    except Exception as e:
        logger.error(
            f"An error occurred while making promptflow_request_v3: {e}")


async def send_chat_request_v3(request_body, request_headers):
    filtered_messages = []
    messages = request_body.get("messages", [])
    for message in messages:
        if message.get("role") != 'tool':
            filtered_messages.append(message)

    request_body['messages'] = filtered_messages
    model_args = prepare_model_args(request_body, request_headers)

    try:
        azure_openai_client = init_openai_client()
        raw_response = await azure_openai_client.chat.completions.with_raw_response.create(**model_args)
        response = raw_response.parse()
        apim_request_id = raw_response.headers.get("apim-request-id")
    except Exception as e:
        logger.error(f"Exception in send_chat_request : {e}")
        # logging.exception("Exception in send_chat_request")
        raise e

    return response, apim_request_id


@bp.route("/v3/history/conversation_feedback", methods=["POST"])
async def add_conversation_feedback_v3():
    authenticated_user = get_authenticated_user_details(
        request_headers=request.headers)
    user_id = authenticated_user["user_principal_id"]
    cosmos_conversation_client = init_cosmosdb_client()

    # check request for message_id
    request_json = await request.get_json()
    conversation_id = request_json['messages'][0].get("conversation_id", None)

    conversation_feedback = request_json['messages'][0].get(
        "conversation_feedback", None)  # request_json.get("conversation_feedback", None)
    conversation_feedback_message = request_json['messages'][0].get(
        "conversation_feedback_message", None)

    try:
        if not conversation_id:
            return jsonify({"error": "conversation_id is required"}), 400

        if not conversation_feedback:
            return jsonify({"error": "conversation_feedback is required"}), 400

        # if not conversation_feedback_message:
        #     return jsonify({"error": "conversation_feedback is required"}), 400

        # update the message in cosmos
        updated_conversation = await cosmos_conversation_client.update_conversation_feedback_v3(
            user_id, conversation_id, conversation_feedback, conversation_feedback_message
        )
        if updated_conversation:
            return (
                jsonify(
                    {
                        "message": f"Successfully updated conversation with feedback {conversation_feedback}",
                        "message_id": conversation_id,
                    }
                ),
                200,
            )
        else:
            return (
                jsonify(
                    {
                        "error": f"Unable to update conversation {conversation_id}. It either does not exist or the user does not have access to it."
                    }
                ),
                404,
            )

    except Exception as e:
        logger.error(f"Exception in send_chat_request : {e}")
        # logging.exception("Exception in /history/conversation_feedback")
        return jsonify({"error": str(e)}), 500


async def get_user_details(user_id):

    CLIENT_ID = '3bf00fa6-49f1-42ad-9317-b5a7cb68beab'
    TENANT_ID = '035c9b6a-9ba7-4804-a377-482ed2642e72'
    # AUTHORITY = f'https://login.microsoftonline.com/{TENANT_ID}'
    SCOPE = ['https://graph.microsoft.com/.default']

    AUTH_CLIENT_SECRET = os.environ.get("AUTH_CLIENT_SECRET", "")

    # Create the credential object
    credentials = ClientSecretCredential(
        TENANT_ID, CLIENT_ID, AUTH_CLIENT_SECRET)

    # Initialize the Graph client
    graph_client = GraphServiceClient(credentials, SCOPE)

    # Fetch user details
    # await graph_client.users.by_user_id(user_id).get()
    me = await graph_client.me.get()

    print(f"User Display Name: {me.display_name}")
    print(f"User Email: {me.mail or me.user_principal_name}")
    print(f"User State: {me.state}")
    print(f"User Country: {me.country}")

    return me

# @bp.route("/get_user_state_via_ms_graph", methods=["POST"])


async def get_user_state_via_ms_graph():
    authenticated_user = get_authenticated_user_details(
        request_headers=request.headers)
    user_id = authenticated_user["user_principal_id"]

    logger.error(f'user_id: {user_id}')
    logger.error("calling receive get_user_state_via_ms_graph()")

    AUTH_CLIENT_SECRET = os.environ.get("AUTH_CLIENT_SECRET", "")

    logger.error(f"AUTH_CLIENT_SECRET: {AUTH_CLIENT_SECRET}")

    try:

        # Fetch user details
        # graph_client.users.by_user_id(user_id).get()
        user_details = await get_user_details(user_id)

        logger.error(f"user_details: {user_details}")

        # display_name = user_details.get('displayName')
        # email = user_details.get('mail')
        # state = user_details.get('state')
        # country = user_details.get('country')  # or use 'countryOrRegion' based on your Azure AD configuration

        # logger.error(f"User Display Name: {display_name}")
        # logger.error(f"User Email: {email}")
        # logger.error(f"User state: {state}")
        # logger.error(f"User country: {country}")

        return None

    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return None

app = create_app()
