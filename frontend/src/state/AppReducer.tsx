import { Action, AppState } from './AppProvider'

// Define the reducer function
export const appStateReducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'TOGGLE_CHAT_HISTORY':
      return { ...state, isChatHistoryOpen: !state.isChatHistoryOpen }
    case 'UPDATE_CURRENT_CHAT':
      return { ...state, currentChat: action.payload }
    case 'SET_RECOMMENDATIONS_STATE':
      return { ...state, recommendation: action.payload, isLoadingRecommendations: false }
    case 'SET_RECOMMENDATIONS_LOADING':
      return { ...state, isLoadingRecommendations: action.payload };
    case 'SET_VALUE_PROPOSITION_STATE':
      return { ...state, valuePropositions: action.payload, isLoadingValuePropositions: false }
    case 'SET_VALUE_PROPOSITION_LOADING':
      return { ...state, isLoadingValuePropositions: action.payload };
    case 'SET_WALKTHROUGH_STATE':
      return { ...state, walkthorugh: action.payload, isLoadingWalkThrough: false }
    case 'SET_WALKTHROUGH_LOADING':
      return { ...state, isLoadingWalkThrough: action.payload };
    case 'SET_SELECTED_TAGS':
      return { ...state, selectedTags: action.payload };
    case 'SET_CONVERSATION_ID':
      return { ...state, conversationId: action.payload };
    case 'SET_PROMPT_VALUE':
      return { ...state, promptvalue: action.payload };
    case 'SET_TRAITS_VALUE':
      return { ...state, traits: action.payload };
    case 'SET_SELECTED_BOAT':
      return { ...state, selectedBoat: action.payload };
    case 'SET_SELECTED_BRAND':
      return { ...state, selectedBrand: action.payload };
    case 'UPDATE_CHAT_HISTORY_LOADING_STATE':
      return { ...state, chatHistoryLoadingState: action.payload }
    case 'UPDATE_CHAT_HISTORY':
      if (!state.chatHistory || !state.currentChat) {
        return state
      }
      const conversationIndex = state.chatHistory.findIndex(conv => conv.id === action.payload.id)
      if (conversationIndex !== -1) {
        const updatedChatHistory = [...state.chatHistory]
        updatedChatHistory[conversationIndex] = state.currentChat
        return { ...state, chatHistory: updatedChatHistory }
      } else {
        return { ...state, chatHistory: [...state.chatHistory, action.payload] }
      }
    case 'UPDATE_CHAT_TITLE':
      if (!state.chatHistory) {
        return { ...state, chatHistory: [] }
      }
      const updatedChats = state.chatHistory.map(chat => {
        if (chat.id === action.payload.id) {
          if (state.currentChat?.id === action.payload.id) {
            state.currentChat.title = action.payload.title
          }
          //TODO: make api call to save new title to DB
          return { ...chat, title: action.payload.title }
        }
        return chat
      })
      return { ...state, chatHistory: updatedChats }
    case 'DELETE_CHAT_ENTRY':
      if (!state.chatHistory) {
        return { ...state, chatHistory: [] }
      }
      const filteredChat = state.chatHistory.filter(chat => chat.id !== action.payload)
      state.currentChat = null
      //TODO: make api call to delete conversation from DB
      return { ...state, chatHistory: filteredChat }
    case 'DELETE_CHAT_HISTORY':
      //TODO: make api call to delete all conversations from DB
      return { ...state, chatHistory: [], filteredChatHistory: [], currentChat: null }
    case 'DELETE_CURRENT_CHAT_MESSAGES':
      //TODO: make api call to delete current conversation messages from DB
      if (!state.currentChat || !state.chatHistory) {
        return state
      }
      const updatedCurrentChat = {
        ...state.currentChat,
        messages: []
      }
      return {
        ...state,
        currentChat: updatedCurrentChat
      }
    case 'FETCH_CHAT_HISTORY':
      return { ...state, chatHistory: action.payload }
    case 'SET_COSMOSDB_STATUS':
      return { ...state, isCosmosDBAvailable: action.payload }
    case 'FETCH_FRONTEND_SETTINGS':
      return { ...state, frontendSettings: action.payload }
    case 'SET_FEEDBACK_STATE':
      return {
        ...state,
        feedbackState: {
          ...state.feedbackState,
          [action.payload.answerId]: action.payload.feedback
        }
      }
    default:
      return state
  }
}
