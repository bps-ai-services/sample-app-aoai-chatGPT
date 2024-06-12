import { FormEvent, useContext, useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { nord } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Checkbox, DefaultButton, Dialog, FontIcon, PrimaryButton, Stack, Text } from '@fluentui/react'
import { useBoolean } from '@fluentui/react-hooks'
import { ThumbDislike20Filled, ThumbLike20Filled } from '@fluentui/react-icons'
import DOMPurify from 'dompurify'
import remarkGfm from 'remark-gfm'
import supersub from 'remark-supersub'
import Plot from 'react-plotly.js'
import { AskResponse, Citation, Feedback, historyMessageFeedback } from '../../api'
import { XSSAllowTags } from '../../constants/xssAllowTags'
import { AppStateContext } from '../../state/AppProvider'
import Carousel from 'react-multi-carousel';

import { parseAnswer } from './AnswerParser'

import 'react-multi-carousel/lib/styles.css'
import styles from './Answer.module.css'

interface Props {
  answer: AskResponse
  onCitationClicked: (citedDocument: Citation) => void
  onExectResultClicked: () => void,
  onBoatSuggestionClicked: (model: string) => void,
  onWalkAroundClicked: () => void,
  onFeedbackClicked: () => void
}

const responsive = {
  xlDeskop: {
    breakpoint: { max: 4000, min: 3000 },
    items: 5
  },
  desktop: {
    breakpoint: { max: 3000, min: 1024 },
    items: 3
  },
  tablet: {
    breakpoint: { max: 1024, min: 464 },
    items: 2
  },
  mobile: {
    breakpoint: { max: 464, min: 0 },
    items: 1
  }
};

export const Answer = ({ answer, onCitationClicked, onExectResultClicked, onBoatSuggestionClicked, onWalkAroundClicked, onFeedbackClicked }: Props) => {
  const initializeAnswerFeedback = (answer: AskResponse) => {
    if (answer.message_id == undefined) return undefined
    if (answer.feedback == undefined) return undefined
    if (answer.feedback.split(',').length > 1) return Feedback.Negative
    if (Object.values(Feedback).includes(answer.feedback)) return answer.feedback
    return Feedback.Neutral
  }

  const [isRefAccordionOpen, { toggle: toggleIsRefAccordionOpen }] = useBoolean(false)
  const filePathTruncationLimit = 50

  const parsedAnswer = useMemo(() => parseAnswer(answer), [answer])
  const [chevronIsExpanded, setChevronIsExpanded] = useState(isRefAccordionOpen)
  const [feedbackState, setFeedbackState] = useState(initializeAnswerFeedback(answer))
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false)
  const [showReportInappropriateFeedback, setShowReportInappropriateFeedback] = useState(false)
  const [negativeFeedbackList, setNegativeFeedbackList] = useState<Feedback[]>([])
  const appStateContext = useContext(AppStateContext)
  const FEEDBACK_ENABLED =
    appStateContext?.state.frontendSettings?.feedback_enabled && appStateContext?.state.isCosmosDBAvailable?.cosmosDB
  const SANITIZE_ANSWER = appStateContext?.state.frontendSettings?.sanitize_answer

  const handleChevronClick = () => {
    setChevronIsExpanded(!chevronIsExpanded)
    toggleIsRefAccordionOpen()
  }

  useEffect(() => {
    setChevronIsExpanded(isRefAccordionOpen)
  }, [isRefAccordionOpen])

  useEffect(() => {
    if (answer.message_id == undefined) return

    let currentFeedbackState
    if (appStateContext?.state.feedbackState && appStateContext?.state.feedbackState[answer.message_id]) {
      currentFeedbackState = appStateContext?.state.feedbackState[answer.message_id]
    } else {
      currentFeedbackState = initializeAnswerFeedback(answer)
    }
    setFeedbackState(currentFeedbackState)
  }, [appStateContext?.state.feedbackState, feedbackState, answer.message_id])

  const createCitationFilepath = (citation: Citation, index: number, truncate: boolean = false) => {
    let citationFilename = ''

    if (citation.filepath) {
      const part_i = citation.part_index ?? (citation.chunk_id ? parseInt(citation.chunk_id) + 1 : '')
      if (truncate && citation.filepath.length > filePathTruncationLimit) {
        const citationLength = citation.filepath.length
        citationFilename = `${citation.filepath.substring(0, 20)}...${citation.filepath.substring(citationLength - 20)} - Part ${part_i}`
      } else {
        citationFilename = `${citation.filepath} - Part ${part_i}`
      }
    } else if (citation.filepath && citation.reindex_id) {
      citationFilename = `${citation.filepath} - Part ${citation.reindex_id}`
    } else {
      citationFilename = `Citation ${index}`
    }
    return citationFilename
  }

  const onLikeResponseClicked = async () => {
    if (answer.message_id == undefined) return

    let newFeedbackState = feedbackState
    // Set or unset the thumbs up state
    if (feedbackState == Feedback.Positive) {
      newFeedbackState = Feedback.Neutral
    } else {
      newFeedbackState = Feedback.Positive
    }
    appStateContext?.dispatch({
      type: 'SET_FEEDBACK_STATE',
      payload: { answerId: answer.message_id, feedback: newFeedbackState }
    })
    setFeedbackState(newFeedbackState)

    // Update message feedback in db
    await historyMessageFeedback(answer.message_id, newFeedbackState)
  }

  const onDislikeResponseClicked = async () => {
    if (answer.message_id == undefined) return

    let newFeedbackState = feedbackState
    if (feedbackState === undefined || feedbackState === Feedback.Neutral || feedbackState === Feedback.Positive) {
      newFeedbackState = Feedback.Negative
      setFeedbackState(newFeedbackState)
      setIsFeedbackDialogOpen(true)
    } else {
      // Reset negative feedback to neutral
      newFeedbackState = Feedback.Neutral
      setFeedbackState(newFeedbackState)
      await historyMessageFeedback(answer.message_id, Feedback.Neutral)
    }
    appStateContext?.dispatch({
      type: 'SET_FEEDBACK_STATE',
      payload: { answerId: answer.message_id, feedback: newFeedbackState }
    })
  }

  const updateFeedbackList = (ev?: FormEvent<HTMLElement | HTMLInputElement>, checked?: boolean) => {
    if (answer.message_id == undefined) return
    const selectedFeedback = (ev?.target as HTMLInputElement)?.id as Feedback

    let feedbackList = negativeFeedbackList.slice()
    if (checked) {
      feedbackList.push(selectedFeedback)
    } else {
      feedbackList = feedbackList.filter(f => f !== selectedFeedback)
    }

    setNegativeFeedbackList(feedbackList)
  }

  const onSubmitNegativeFeedback = async () => {
    if (answer.message_id == undefined) return
    await historyMessageFeedback(answer.message_id, negativeFeedbackList.join(','))
    resetFeedbackDialog()
  }

  const resetFeedbackDialog = () => {
    setIsFeedbackDialogOpen(false)
    setShowReportInappropriateFeedback(false)
    setNegativeFeedbackList([])
  }

  const UnhelpfulFeedbackContent = () => {
    return (
      <>
        <div>Why wasn't this response helpful?</div>
        <Stack tokens={{ childrenGap: 4 }}>
          <Checkbox
            label="Citations are missing"
            id={Feedback.MissingCitation}
            defaultChecked={negativeFeedbackList.includes(Feedback.MissingCitation)}
            onChange={updateFeedbackList}></Checkbox>
          <Checkbox
            label="Citations are wrong"
            id={Feedback.WrongCitation}
            defaultChecked={negativeFeedbackList.includes(Feedback.WrongCitation)}
            onChange={updateFeedbackList}></Checkbox>
          <Checkbox
            label="The response is not from my data"
            id={Feedback.OutOfScope}
            defaultChecked={negativeFeedbackList.includes(Feedback.OutOfScope)}
            onChange={updateFeedbackList}></Checkbox>
          <Checkbox
            label="Inaccurate or irrelevant"
            id={Feedback.InaccurateOrIrrelevant}
            defaultChecked={negativeFeedbackList.includes(Feedback.InaccurateOrIrrelevant)}
            onChange={updateFeedbackList}></Checkbox>
          <Checkbox
            label="Other"
            id={Feedback.OtherUnhelpful}
            defaultChecked={negativeFeedbackList.includes(Feedback.OtherUnhelpful)}
            onChange={updateFeedbackList}></Checkbox>
        </Stack>
        <div onClick={() => setShowReportInappropriateFeedback(true)} style={{ color: '#115EA3', cursor: 'pointer' }}>
          Report inappropriate content
        </div>
      </>
    )
  }

  const ReportInappropriateFeedbackContent = () => {
    return (
      <>
        <div>
          The content is <span style={{ color: 'red' }}>*</span>
        </div>
        <Stack tokens={{ childrenGap: 4 }}>
          <Checkbox
            label="Hate speech, stereotyping, demeaning"
            id={Feedback.HateSpeech}
            defaultChecked={negativeFeedbackList.includes(Feedback.HateSpeech)}
            onChange={updateFeedbackList}></Checkbox>
          <Checkbox
            label="Violent: glorification of violence, self-harm"
            id={Feedback.Violent}
            defaultChecked={negativeFeedbackList.includes(Feedback.Violent)}
            onChange={updateFeedbackList}></Checkbox>
          <Checkbox
            label="Sexual: explicit content, grooming"
            id={Feedback.Sexual}
            defaultChecked={negativeFeedbackList.includes(Feedback.Sexual)}
            onChange={updateFeedbackList}></Checkbox>
          <Checkbox
            label="Manipulative: devious, emotional, pushy, bullying"
            defaultChecked={negativeFeedbackList.includes(Feedback.Manipulative)}
            id={Feedback.Manipulative}
            onChange={updateFeedbackList}></Checkbox>
          <Checkbox
            label="Other"
            id={Feedback.OtherHarmful}
            defaultChecked={negativeFeedbackList.includes(Feedback.OtherHarmful)}
            onChange={updateFeedbackList}></Checkbox>
        </Stack>
      </>
    )
  }

  const components = {
    code({ node, ...props }: { node: any;[key: string]: any }) {
      let language
      if (props.className) {
        const match = props.className.match(/language-(\w+)/)
        language = match ? match[1] : undefined
      }
      const codeString = node.children[0].value ?? ''
      return (
        <SyntaxHighlighter style={nord} language={language} PreTag="div" {...props}>
          {codeString}
        </SyntaxHighlighter>
      )
    }
  }

  if (answer.value_propositions && answer.value_propositions?.length > 0) {
    return (
      <Stack style={{width: '100%'}}>
        <Text variant='xLargePlus'>Value Propositions</Text>
        <Stack style={{width: '100%'}}>
          {answer.value_propositions?.map((valueProp) => (
            <Stack key={valueProp.proposition} className={styles.propositionContainer}>
              <Stack.Item>
                <Text variant='large' className={styles.propositionContainerHeading}>{valueProp.proposition}</Text>
              </Stack.Item>
              <Stack.Item>
                <Text className={styles.propositionContainerText}>{valueProp.details}</Text>
              </Stack.Item>
            </Stack>
          ))}
        </Stack>
        <PrimaryButton 
          text='Walk Around'
          style={{marginTop: 12, borderRadius: '5.419px', backgroundColor: '#151b1e'}}
          onClick={onWalkAroundClicked}/>
      </Stack>
    )
  }

  if (answer.walkaround_script && answer.walkaround_script?.length > 0) {
    return (
      <Stack style={{width:'100%'}}>
        <Text variant='xLargePlus'>Walkaround</Text>
        <Stack>
        <Carousel 
          responsive={responsive}
          swipeable={true}
          draggable={true}
          showDots={true}
          autoPlay={false}
          removeArrowOnDeviceType={["tablet", "mobile"]}
          keyBoardControl={true}
          >
          {answer.walkaround_script?.map((walkaround) => (
            <div style={{padding: '6px'}}>
            <Stack key={walkaround.heading} className={styles.walkaroundContainer}>
              <Stack.Item className={styles.walkaroundContainerHeadingContainer}>
                <Text variant='large' className={styles.walkaroundContainerHeading}>{walkaround.heading}</Text>
              </Stack.Item>
              <Stack.Item className={styles.walkaroundContainerTextContainer}>
                <Text variant='xxLarge' className={styles.walkaroundContainerText}>{walkaround.details}</Text>
              </Stack.Item>
            </Stack>
            </div>
          ))}
          </Carousel>
        </Stack>
        <PrimaryButton 
          text='Feedback'
          style={{marginTop: 12, borderRadius: '5.419px', backgroundColor: '#151b1e'}}
          onClick={onFeedbackClicked}/>
      </Stack>
    )
  }

  if (answer.boat_suggestions && answer.boat_suggestions?.length > 0) {
    return (
      <Stack style={{width: '100%'}}>
        <Text variant='xLargePlus'>Top Recommendations</Text>
        <Stack style={{width: '100%'}}>
          {answer.boat_suggestions?.map((boat) => (
            <Stack key={boat.model} className={styles.suggestionContainer} horizontal onClick={() => onBoatSuggestionClicked(boat.model)}>
              <Stack>
                <img src="#" style={{width: 64, height: 64, borderRadius: '5.419px'}}/>
              </Stack>
              <Stack style={{marginLeft: '12px'}}>
                <Stack.Item>
                  <Text variant='large' className={styles.suggestionContainerHeading}>{boat.product} {boat.model}</Text>
                </Stack.Item>
                <Stack.Item>
                  <Text className={styles.suggestionContainerText}>{boat.summary}</Text>
                </Stack.Item>
              </Stack>
            </Stack>
          ))}
        </Stack>
      </Stack>
    )
  }

  if(answer.error) {
    return (
      <Stack style={{width: '100%'}}>
        <Stack style={{width: '100%'}}>
            <Stack className={styles.errorContainer}>
              <Stack.Item >
                <Text variant='large' className={styles.errorContainerText}>{answer.error}</Text>
              </Stack.Item>
            </Stack>
        </Stack>
      </Stack>
    )
  }

  return (
    <>
      <Stack className={styles.answerContainer} tabIndex={0}>
        <Stack.Item>
          <Stack horizontal grow>
            <Stack.Item grow>
              <ReactMarkdown
                linkTarget="_blank"
                remarkPlugins={[remarkGfm, supersub]}
                children={
                  SANITIZE_ANSWER
                    ? DOMPurify.sanitize(parsedAnswer.markdownFormatText, { ALLOWED_TAGS: XSSAllowTags })
                    : parsedAnswer.markdownFormatText
                }
                className={styles.answerText}
                components={components}
              />
            </Stack.Item>
            <Stack.Item className={styles.answerHeader}>
              {FEEDBACK_ENABLED && answer.message_id !== undefined && (
                <Stack horizontal horizontalAlign="space-between">
                  <ThumbLike20Filled
                    aria-hidden="false"
                    aria-label="Like this response"
                    onClick={() => onLikeResponseClicked()}
                    style={
                      feedbackState === Feedback.Positive ||
                        appStateContext?.state.feedbackState[answer.message_id] === Feedback.Positive
                        ? { color: 'darkgreen', cursor: 'pointer' }
                        : { color: 'slategray', cursor: 'pointer' }
                    }
                  />
                  <ThumbDislike20Filled
                    aria-hidden="false"
                    aria-label="Dislike this response"
                    onClick={() => onDislikeResponseClicked()}
                    style={
                      feedbackState !== Feedback.Positive &&
                        feedbackState !== Feedback.Neutral &&
                        feedbackState !== undefined
                        ? { color: 'darkred', cursor: 'pointer' }
                        : { color: 'slategray', cursor: 'pointer' }
                    }
                  />
                </Stack>
              )}
            </Stack.Item>
          </Stack>
        </Stack.Item>
        {parsedAnswer.plotly_data !== null && (
          <Stack className={styles.answerContainer}>
            <Stack.Item grow>
              <Plot data={parsedAnswer.plotly_data.data} layout={parsedAnswer.plotly_data.layout} />
            </Stack.Item>
          </Stack>
        )}
        <Stack horizontal className={styles.answerFooter}>
          {!!parsedAnswer.citations.length && (
            <Stack.Item onKeyDown={e => (e.key === 'Enter' || e.key === ' ' ? toggleIsRefAccordionOpen() : null)}>
              <Stack style={{ width: '100%' }}>
                <Stack horizontal horizontalAlign="start" verticalAlign="center">
                  <Text
                    className={styles.accordionTitle}
                    onClick={toggleIsRefAccordionOpen}
                    aria-label="Open references"
                    tabIndex={0}
                    role="button">
                    <span>
                      {parsedAnswer.citations.length > 1
                        ? parsedAnswer.citations.length + ' references'
                        : '1 reference'}
                    </span>
                  </Text>
                  <FontIcon
                    className={styles.accordionIcon}
                    onClick={handleChevronClick}
                    iconName={chevronIsExpanded ? 'ChevronDown' : 'ChevronRight'}
                  />
                </Stack>
              </Stack>
            </Stack.Item>
          )}
          <Stack.Item className={styles.answerDisclaimerContainer}>
            <span className={styles.answerDisclaimer}>AI-generated content may be incorrect</span>
          </Stack.Item>
          {!!answer.exec_results?.length && (
            <Stack.Item onKeyDown={e => (e.key === 'Enter' || e.key === ' ' ? toggleIsRefAccordionOpen() : null)}>
              <Stack style={{ width: '100%' }}>
                <Stack horizontal horizontalAlign="start" verticalAlign="center">
                  <Text
                    className={styles.accordionTitle}
                    onClick={() => onExectResultClicked()}
                    aria-label="Open exec results"
                    tabIndex={0}
                    role="button">
                    <span>
                      Show Exec Results
                    </span>
                  </Text>
                  <FontIcon
                    className={styles.accordionIcon}
                    onClick={handleChevronClick}
                    iconName={'ChevronRight'}
                  />
                </Stack>
              </Stack>
            </Stack.Item>
          )}
        </Stack>
        {chevronIsExpanded && (
          <div className={styles.citationWrapper}>
            {parsedAnswer.citations.map((citation, idx) => {
              return (
                <span
                  title={createCitationFilepath(citation, ++idx)}
                  tabIndex={0}
                  role="link"
                  key={idx}
                  onClick={() => onCitationClicked(citation)}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ' ? onCitationClicked(citation) : null)}
                  className={styles.citationContainer}
                  aria-label={createCitationFilepath(citation, idx)}>
                  <div className={styles.citation}>{idx}</div>
                  {createCitationFilepath(citation, idx, true)}
                </span>
              )
            })}
          </div>
        )}
      </Stack>
      <Dialog
        onDismiss={() => {
          resetFeedbackDialog()
          setFeedbackState(Feedback.Neutral)
        }}
        hidden={!isFeedbackDialogOpen}
        styles={{
          main: [
            {
              selectors: {
                ['@media (min-width: 480px)']: {
                  maxWidth: '600px',
                  background: '#FFFFFF',
                  boxShadow: '0px 14px 28.8px rgba(0, 0, 0, 0.24), 0px 0px 8px rgba(0, 0, 0, 0.2)',
                  borderRadius: '8px',
                  maxHeight: '600px',
                  minHeight: '100px'
                }
              }
            }
          ]
        }}
        dialogContentProps={{
          title: 'Submit Feedback',
          showCloseButton: true
        }}>
        <Stack tokens={{ childrenGap: 4 }}>
          <div>Your feedback will improve this experience.</div>

          {!showReportInappropriateFeedback ? <UnhelpfulFeedbackContent /> : <ReportInappropriateFeedbackContent />}

          <div>By pressing submit, your feedback will be visible to the application owner.</div>

          <DefaultButton disabled={negativeFeedbackList.length < 1} onClick={onSubmitNegativeFeedback}>
            Submit
          </DefaultButton>
        </Stack>
      </Dialog>
    </>
  )
}
