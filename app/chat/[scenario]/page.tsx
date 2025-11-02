"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowLeft, LogOut, Send, ChevronLeft, ChevronRight, RotateCcw, Settings, Eye } from "lucide-react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useScenarioStore, type Message, type ScenarioProgress, GROOMING_STAGES } from "../../store/useScenarioStore";
import MessageBubble from "../MessageBubble";
import Avatar from "../Avatar";
import TypingIndicator from "../TypingIndicator";
import Button from "@/components/Button";
import ReactMarkdown from "react-markdown";

interface FeedbackItem {
  feedback: string;
  messageIndex: number;
  messageCount: number;
  lastUserMessage: string;
  timestamp: Date;
}

export default function ChatPage() {
  const router = useRouter();
  const params = useParams();
  const scenarioSlug = params.scenario as string;
  const {
    scenarios,
    commonSystemPrompt,
    feedbackPersona,
    feedbackInstruction,
    isAdmin,
    isParent,
    isAuthenticated,
    userType,
    saveUserMessage,
    saveUserFeedback,
    loadUserMessages,
    loadUserFeedbacks,
    recordScenarioVisit,
    loadScenarioProgress,
    resetScenarioProgress,
    logout
  } = useScenarioStore();

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  const initialScenarioIndex = scenarios.findIndex(s => s.slug === scenarioSlug);
  const [currentScenario, setCurrentScenario] = useState(initialScenarioIndex >= 0 ? initialScenarioIndex : 0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [responseText, setResponseText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<FeedbackItem | null>(null);
  const [messageFeedbackMap, setMessageFeedbackMap] = useState<Map<number, FeedbackItem>>(new Map());
  const [selectedMessageIndex, setSelectedMessageIndex] = useState<number | null>(null);
  const [hoveredMessageIndex, setHoveredMessageIndex] = useState<number | null>(null);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [scenarioProgressMap, setScenarioProgressMap] = useState<Map<number, ScenarioProgress>>(new Map());
  const [hoveredButton, setHoveredButton] = useState<'preview' | 'send' | null>(null);
  const [previewFeedback, setPreviewFeedback] = useState<FeedbackItem | null>(null);
  const [previewText, setPreviewText] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const feedbackContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    // Load messages for user/parent type, or use preset for admin
    const loadMessages = async () => {
      if ((userType === 'user' || userType === 'parent') && scenarios[currentScenario]) {
        const savedMessages = await loadUserMessages(scenarios[currentScenario].id);
        const savedFeedbacks = await loadUserFeedbacks(scenarios[currentScenario].id);

        // Record visit
        await recordScenarioVisit(scenarios[currentScenario].id);

        // Load progress for all scenarios
        const progressMap = await loadScenarioProgress();
        setScenarioProgressMap(progressMap);

        if (savedMessages.length > 0) {
          // Mark messages that have feedback
          const messagesWithFeedback = savedMessages.map(msg => ({
            ...msg,
            feedbackGenerated: savedFeedbacks.has(msg.id)
          }));
          setMessages(messagesWithFeedback);

          // Load feedback map
          const feedbackMap = new Map<number, FeedbackItem>();
          messagesWithFeedback.forEach((msg, index) => {
            if (savedFeedbacks.has(msg.id)) {
              feedbackMap.set(index, {
                feedback: savedFeedbacks.get(msg.id)!,
                messageIndex: index,
                messageCount: index + 1,
                lastUserMessage: msg.sender === 'user' ? msg.text : 'Conversation',
                timestamp: new Date()
              });
            }
          });
          setMessageFeedbackMap(feedbackMap);
        } else {
          // First time: save preset messages with unique IDs
          const presetMessages = scenarios[currentScenario].presetMessages.map((msg, index) => ({
            ...msg,
            id: `${scenarios[currentScenario].id}-preset-${index}-${msg.id}` // Make ID unique per scenario
          }));
          setMessages(presetMessages);

          // Save preset messages to DB
          for (const msg of presetMessages) {
            try {
              await saveUserMessage(scenarios[currentScenario].id, msg);
            } catch (error) {
              console.error('Failed to save preset message:', error);
            }
          }
        }
      } else {
        setMessages(scenarios[currentScenario].presetMessages);
      }
    };

    loadMessages();
  }, [scenarios, currentScenario, userType, loadUserMessages, loadUserFeedbacks, saveUserMessage, recordScenarioVisit, loadScenarioProgress]);

  const generateFeedback = async (messageIndex: number) => {
    setIsGeneratingFeedback(true);
    setSelectedMessageIndex(messageIndex);

    try {
      // Get conversation up to this message
      const conversationUpToMessage = messages.slice(0, messageIndex + 1);

      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationHistory: conversationUpToMessage,
          feedbackPersona,
          feedbackInstruction,
        }),
      });

      const data = await response.json();

      if (data.feedback) {
        // Get last user message in the slice
        const userMessages = conversationUpToMessage.filter(m => m.sender === 'user');
        const lastUserMessage = userMessages.length > 0
          ? userMessages[userMessages.length - 1].text
          : 'No user messages';

        // Create feedback item with metadata
        const feedbackItem: FeedbackItem = {
          feedback: data.feedback,
          messageIndex,
          messageCount: conversationUpToMessage.length,
          lastUserMessage: lastUserMessage.length > 50
            ? lastUserMessage.substring(0, 50) + '...'
            : lastUserMessage,
          timestamp: new Date(),
        };

        // Save to map
        setMessageFeedbackMap(prev => new Map(prev).set(messageIndex, feedbackItem));

        // Mark message as having feedback
        setMessages(prev => prev.map((msg, idx) =>
          idx === messageIndex ? { ...msg, feedbackGenerated: true } : msg
        ));

        // Set as current feedback
        setCurrentFeedback(feedbackItem);

        // Save feedback for user type
        if (userType === 'user') {
          try {
            await saveUserFeedback(scenarios[currentScenario].id, messages[messageIndex].id, data.feedback);
          } catch (error) {
            console.error('Failed to save feedback:', error);
          }
        }

        // Scroll feedback container to top
        setTimeout(() => {
          if (feedbackContainerRef.current) {
            feedbackContainerRef.current.scrollTop = 0;
          }
        }, 100);
      } else {
        throw new Error('No feedback in response');
      }

      setIsGeneratingFeedback(false);
    } catch (error) {
      console.error('Feedback generation error:', error);
      const errorItem: FeedbackItem = {
        feedback: 'Failed to generate feedback. Please try again.',
        messageIndex,
        messageCount: messageIndex + 1,
        lastUserMessage: 'Error',
        timestamp: new Date(),
      };
      setCurrentFeedback(errorItem);
      setIsGeneratingFeedback(false);
    }
  };

  const handleSendResponse = async () => {
    if (responseText.trim() && !isTyping && !isGeneratingFeedback) {
      const textToSend = responseText;
      setResponseText("");

      // Add message to chat immediately
      const newMessage: Message = {
        id: Date.now().toString(),
        text: textToSend,
        sender: "user",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, newMessage]);

      // Save user message if user type
      if (userType === 'user') {
        try {
          await saveUserMessage(scenarios[currentScenario].id, newMessage);
        } catch (error) {
          console.error('Failed to save user message:', error);
        }
      }

      // Show typing indicator and call OpenAI API
      setIsTyping(true);

      // Call OpenAI API
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationHistory: messages,
          systemMessage: scenario.systemPrompt,
          commonSystemPrompt: commonSystemPrompt,
          userMessage: textToSend,
        }),
      })
        .then(res => res.json())
        .then(async data => {
          const autoReply: Message = {
            id: (Date.now() + 1).toString(),
            text: data.reply || "Sorry, I couldn't respond right now.",
            sender: "other",
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, autoReply]);

          // Save AI reply if user type
          if (userType === 'user') {
            try {
              await saveUserMessage(scenarios[currentScenario].id, autoReply);
            } catch (error) {
              console.error('Failed to save AI message:', error);
            }
          }

          setIsTyping(false);
        })
        .catch(error => {
          console.error('API error:', error);
          setIsTyping(false);
        });
    }
  };

  const handleMessageClick = (index: number) => {
    setSelectedMessageIndex(index);

    // Check if feedback already exists for this message
    if (messageFeedbackMap.has(index)) {
      setCurrentFeedback(messageFeedbackMap.get(index) || null);
    } else {
      // Generate new feedback
      generateFeedback(index);
    }
  };

  const handlePreviewFeedback = async () => {
    if (!responseText.trim() || isGeneratingFeedback || isTyping) return;

    // Check if we already have feedback for this exact text
    if (previewText === responseText && previewFeedback) {
      // Already have feedback, show it
      setCurrentFeedback(previewFeedback);
      setSelectedMessageIndex(null);

      // Scroll feedback container to top
      setTimeout(() => {
        if (feedbackContainerRef.current) {
          feedbackContainerRef.current.scrollTop = 0;
        }
      }, 100);
      return;
    }

    setIsGeneratingFeedback(true);
    setSelectedMessageIndex(null);

    try {
      // Create a temporary message array including the preview message
      const previewMessage: Message = {
        id: 'preview-temp',
        text: responseText,
        sender: 'user',
        timestamp: new Date(),
      };

      const conversationWithPreview = [...messages, previewMessage];

      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationHistory: conversationWithPreview,
          feedbackPersona,
          feedbackInstruction,
        }),
      });

      const data = await response.json();

      if (data.feedback) {
        const feedbackItem: FeedbackItem = {
          feedback: data.feedback,
          messageIndex: conversationWithPreview.length - 1,
          messageCount: conversationWithPreview.length,
          lastUserMessage: responseText.length > 50
            ? responseText.substring(0, 50) + '...'
            : responseText,
          timestamp: new Date(),
        };

        // Store and show feedback
        setPreviewFeedback(feedbackItem);
        setPreviewText(responseText);
        setCurrentFeedback(feedbackItem);

        // Scroll feedback container to top
        setTimeout(() => {
          if (feedbackContainerRef.current) {
            feedbackContainerRef.current.scrollTop = 0;
          }
        }, 100);
      } else {
        throw new Error('No feedback in response');
      }

      setIsGeneratingFeedback(false);
    } catch (error) {
      console.error('Preview feedback generation error:', error);
      setIsGeneratingFeedback(false);
    }
  };

  const handlePreviousScenario = () => {
    if (currentScenario > 0) {
      const prevScenario = currentScenario - 1;
      router.push(`/chat/${scenarios[prevScenario].slug}`);
      setCurrentScenario(prevScenario);
      setMessages(scenarios[prevScenario].presetMessages);
      setResponseText("");
      setIsTyping(false);
      setCurrentFeedback(null);
      setMessageFeedbackMap(new Map());
      setSelectedMessageIndex(null);
    }
  };

  const handleNextScenario = () => {
    if (currentScenario < scenarios.length - 1) {
      const nextScenario = currentScenario + 1;
      router.push(`/chat/${scenarios[nextScenario].slug}`);
      setCurrentScenario(nextScenario);
      setMessages(scenarios[nextScenario].presetMessages);
      setResponseText("");
      setIsTyping(false);
      setCurrentFeedback(null);
      setMessageFeedbackMap(new Map());
      setSelectedMessageIndex(null);
    }
  };

  const handleReset = async () => {
    const scenarioName = scenarios[currentScenario].name;

    if (!confirm(`Are you sure you want to reset "${scenarioName}"?\n\nThis will permanently delete:\n• All messages\n• All feedback\n• Visit history\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      if (userType === 'user') {
        // For user type: delete from database
        await resetScenarioProgress(scenarios[currentScenario].id);

        // Reset local state
        setMessages([]);
        setResponseText("");
        setIsTyping(false);
        setCurrentFeedback(null);
        setMessageFeedbackMap(new Map());
        setSelectedMessageIndex(null);

        // Reload messages from DB (will save preset messages as it's empty now)
        const savedMessages = await loadUserMessages(scenarios[currentScenario].id);

        if (savedMessages.length === 0) {
          // Save and display preset messages
          const presetMessages = scenarios[currentScenario].presetMessages;
          setMessages(presetMessages);

          for (const msg of presetMessages) {
            try {
              await saveUserMessage(scenarios[currentScenario].id, msg);
            } catch (error) {
              console.error('Failed to save preset message:', error);
            }
          }
        } else {
          setMessages(savedMessages);
        }
      } else {
        // For admin type: just reset local state (temporary)
        setMessages(scenarios[currentScenario].presetMessages);
        setResponseText("");
        setIsTyping(false);
        setCurrentFeedback(null);
        setMessageFeedbackMap(new Map());
        setSelectedMessageIndex(null);
      }
    } catch (error) {
      console.error('Failed to reset scenario:', error);
      alert('Failed to reset scenario. Please try again.');
    }
  };

  const scenario = scenarios[currentScenario];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            {isAdmin ? (
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-800 font-bold transition-colors"
              >
                <Settings className="w-5 h-5" />
                Settings
              </Link>
            ) : (
              <Link href="/select-user" className="inline-flex items-center text-gray-600 hover:text-gray-900">
                <ArrowLeft className="w-5 h-5 mr-2" />
                {isParent ? "Select an Educator" : "Select a Teacher"}
              </Link>
            )}
            <Button
              onClick={() => {
                logout();
                router.push("/");
              }}
              variant="ghost"
              size="small"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
          <div className="mb-6">
            <h1 className="text-2xl font-bold">{scenario.name}</h1>
            <p className="text-sm text-gray-600 mt-1">{scenario.description}</p>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Chat Simulation - Left */}
          <div className="flex flex-col">
            <div className="bg-white rounded-lg shadow w-full h-[700px] flex flex-col">
              {/* Chat Header */}
              <div className="bg-white border-b border-gray-200 px-6 py-4 rounded-t-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <Avatar seed={scenario.handle} size={40} />
                    <div>
                      <p className="font-semibold">{scenario.predatorName}</p>
                      <p className="text-sm text-gray-500">{scenario.handle}</p>
                    </div>
                  </div>
                  {!isParent && (
                  <button
                    onClick={handleReset}
                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                    title={userType === 'user' ? "Reset scenario (delete all messages, feedback, and progress)" : "Reset conversation"}
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                  )}
                </div>
                <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  Stage {scenario.stage}: {GROOMING_STAGES.find(s => s.stage === scenario.stage)?.name || 'Unknown'}
                </div>
              </div>

              {/* Messages */}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50 scroll-smooth">
                {messages.map((message, index) => {
                  const prevMessage = index > 0 ? messages[index - 1] : null;
                  const nextMessage = index < messages.length - 1 ? messages[index + 1] : null;

                  const isFirstInGroup = !prevMessage || prevMessage.sender !== message.sender;
                  const isLastInGroup = !nextMessage || nextMessage.sender !== message.sender;
                  const showAvatar = message.sender === "other" && isLastInGroup;

                  return (
                    <div key={message.id} className={isFirstInGroup ? "mt-2" : "mt-0.5"}>
                      <MessageBubble
                        message={message}
                        isFirstInGroup={isFirstInGroup}
                        isLastInGroup={isLastInGroup}
                        showAvatar={showAvatar}
                        avatarSeed={scenario.handle}
                        onClick={() => handleMessageClick(index)}
                        onHover={(isHovering) => setHoveredMessageIndex(isHovering ? index : null)}
                        hasFeedback={message.feedbackGenerated || false}
                        isSelected={selectedMessageIndex === index}
                        isInHoverRange={hoveredMessageIndex !== null && index < hoveredMessageIndex}
                      />
                    </div>
                  );
                })}
                {isTyping && (
                  <div className="mt-2">
                    <TypingIndicator avatarSeed={scenario.handle} />
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input - Hidden for Parents */}
              {!isParent && (
              <div className="bg-white border-t border-gray-200 px-6 py-4 rounded-b-lg">
                <div className="relative">
                  <div
                    className={`relative ${responseText.trim() && !isTyping && !isGeneratingFeedback ? 'ring-2 ring-gray-400 ring-offset-2 rounded-full transition-all' : ''} ${previewFeedback && previewText === responseText ? 'cursor-pointer' : ''}`}
                    onClick={() => {
                      // When clicking on input area with preview feedback, show the preview feedback
                      if (previewFeedback && previewText === responseText) {
                        setCurrentFeedback(previewFeedback);
                        setSelectedMessageIndex(null);

                        // Scroll feedback container to top
                        setTimeout(() => {
                          if (feedbackContainerRef.current) {
                            feedbackContainerRef.current.scrollTop = 0;
                          }
                        }, 100);
                      }
                    }}
                  >
                    <input
                      type="text"
                      value={responseText}
                      onChange={(e) => {
                        const newText = e.target.value;
                        setResponseText(newText);

                        // Clear preview feedback if text changed
                        if (newText !== previewText) {
                          setPreviewFeedback(null);
                          setPreviewText('');
                          setCurrentFeedback(null);
                          setSelectedMessageIndex(null);
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // When clicking on input with preview feedback, show the preview feedback
                        if (previewFeedback && previewText === responseText) {
                          setCurrentFeedback(previewFeedback);
                          setSelectedMessageIndex(null);

                          // Scroll feedback container to top
                          setTimeout(() => {
                            if (feedbackContainerRef.current) {
                              feedbackContainerRef.current.scrollTop = 0;
                            }
                          }, 100);
                        }
                      }}
                      onFocus={() => {
                        // When focusing on input with preview feedback, show the preview feedback
                        if (previewFeedback && previewText === responseText) {
                          setCurrentFeedback(previewFeedback);
                          setSelectedMessageIndex(null);

                          // Scroll feedback container to top
                          setTimeout(() => {
                            if (feedbackContainerRef.current) {
                              feedbackContainerRef.current.scrollTop = 0;
                            }
                          }, 100);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendResponse();
                        }
                      }}
                      disabled={isTyping || isGeneratingFeedback}
                      className="w-full pl-6 pr-28 py-4 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:cursor-not-allowed text-base"
                      placeholder="Send a message..."
                    />
                    {responseText.trim() && !isTyping && !isGeneratingFeedback && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        <button
                          onClick={handlePreviewFeedback}
                          onMouseEnter={() => setHoveredButton('preview')}
                          onMouseLeave={() => setHoveredButton(null)}
                          className="p-2.5 bg-blue-500 rounded-full text-white hover:bg-blue-600 transition-colors"
                          title="Preview feedback before sending"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        <button
                          onClick={handleSendResponse}
                          onMouseEnter={() => setHoveredButton('send')}
                          onMouseLeave={() => setHoveredButton(null)}
                          className="p-2.5 bg-purple-600 rounded-full text-white hover:bg-purple-700 transition-colors"
                        >
                          <Send className="w-5 h-5 fill-current" />
                        </button>
                      </div>
                    )}
                  </div>
                  {hoveredButton && responseText.trim() && !isTyping && !isGeneratingFeedback && (
                    <span className="absolute -top-6 left-0 text-xs text-gray-500 whitespace-nowrap">
                      {hoveredButton === 'preview' ? 'Preview feedback before sending' : 'Send message'}
                    </span>
                  )}
                </div>
              </div>
              )}
            </div>
          </div>

          {/* Feedback - Right */}
          <div className="flex flex-col">
            {/* Feedback Section */}
            <div className="bg-white rounded-lg shadow p-6 flex flex-col overflow-hidden h-[700px]">
              <div className="mb-4">
                <h2 className="text-lg font-semibold">RYLAI&apos;s Feedback:</h2>
                {currentFeedback && (
                  <p className="text-xs text-gray-500 mt-1">
                    {previewFeedback && currentFeedback === previewFeedback
                      ? `Preview Feedback for message "${currentFeedback.lastUserMessage}"`
                      : `Feedback for message "${currentFeedback.lastUserMessage}"`
                    }
                  </p>
                )}
              </div>

              <div
                ref={feedbackContainerRef}
                className="flex-1 overflow-y-auto text-gray-700 min-h-0"
              >
                {!currentFeedback && !isGeneratingFeedback ? (
                  <p className="text-gray-400 italic">
                    Click on any message or preview your input to generate feedback...
                  </p>
                ) : isGeneratingFeedback ? (
                  <div className="flex items-center space-x-2 text-gray-500">
                    <div className="animate-pulse">●</div>
                    <div className="animate-pulse delay-75">●</div>
                    <div className="animate-pulse delay-150">●</div>
                    <span className="text-sm">Generating feedback...</span>
                  </div>
                ) : (
                  <div>
                    <div className="text-sm text-gray-800 leading-relaxed">
                      <ReactMarkdown
                        components={{
                          h1: (props) => <h1 className="text-xl font-bold mb-3 text-gray-900" {...props} />,
                          h2: (props) => <h2 className="text-lg font-semibold mb-2 mt-4 text-gray-900" {...props} />,
                          h3: (props) => <h3 className="text-base font-semibold mb-2 mt-3 text-gray-900" {...props} />,
                          p: (props) => <p className="mb-3 text-gray-800" {...props} />,
                          ul: (props) => <ul className="list-disc list-inside mb-3 space-y-1 text-gray-800" {...props} />,
                          ol: (props) => <ol className="list-decimal list-inside mb-3 space-y-1 text-gray-800" {...props} />,
                          li: (props) => <li className="text-gray-800" {...props} />,
                          strong: (props) => <strong className="font-semibold text-gray-900" {...props} />,
                          em: (props) => <em className="italic text-gray-800" {...props} />,
                          code: (props) => <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono text-gray-900" {...props} />,
                        }}
                      >
                        {currentFeedback?.feedback || ''}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="max-w-7xl mx-auto mt-8">
          <div className="flex justify-between items-center">
            <Button
              onClick={handlePreviousScenario}
              disabled={currentScenario === 0}
              variant="ghost"
            >
              <ChevronLeft className="w-5 h-5" />
              Back
            </Button>
            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                {scenarios.map((scenario, index) => {
                  const progress = scenarioProgressMap.get(scenario.id);
                  const isVisited = !!progress;

                  return (
                    <div
                      key={index}
                      className="relative group"
                      title={isVisited ? `Visited ${progress.visitCount} time(s)\nLast: ${progress.lastVisitedAt.toLocaleString()}` : 'Not visited yet'}
                    >
                      <div
                        className={`w-2 h-2 rounded-full transition-all ${
                          index === currentScenario
                            ? "bg-purple-600 w-8"
                            : isVisited
                            ? "bg-green-500"
                            : "bg-gray-300"
                        }`}
                      />
                      {isVisited && index !== currentScenario && (
                        <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-green-600 rounded-full" />
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-lg font-semibold text-gray-700">Scenario {currentScenario + 1} of {scenarios.length}</p>
            </div>
            <Button
              onClick={handleNextScenario}
              disabled={currentScenario === scenarios.length - 1}
              variant="primary"
            >
              <span className="flex items-center">
                Next
                <ChevronRight className="w-5 h-5 ml-1" />
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}