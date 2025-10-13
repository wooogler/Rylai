"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowLeft, LogOut, Send, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useScenarioStore, type Message, GROOMING_STAGES } from "../../store/useScenarioStore";
import MessageBubble from "../MessageBubble";
import Avatar from "../Avatar";
import TypingIndicator from "../TypingIndicator";
import Button from "@/components/Button";

interface FeedbackItem {
  feedback: string;
  messageCount: number;
  lastUserMessage: string;
  timestamp: Date;
}

export default function ChatPage() {
  const router = useRouter();
  const params = useParams();
  const scenarioSlug = params.scenario as string;
  const { scenarios, commonSystemPrompt, feedbackPersona, feedbackInstruction, isAdmin, isAuthenticated, logout } = useScenarioStore();

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  const initialScenarioIndex = scenarios.findIndex(s => s.slug === scenarioSlug);
  const [currentScenario, setCurrentScenario] = useState(initialScenarioIndex >= 0 ? initialScenarioIndex : 0);
  const [messages, setMessages] = useState<Message[]>(scenarios[currentScenario].presetMessages);
  const [responseText, setResponseText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<FeedbackItem | null>(null);
  const [feedbackHistory, setFeedbackHistory] = useState<FeedbackItem[]>([]);
  const [viewingHistoryIndex, setViewingHistoryIndex] = useState<number | null>(null);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
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
    // Update messages when scenarios change from admin
    setMessages(scenarios[currentScenario].presetMessages);
  }, [scenarios, currentScenario]);

  const generateFeedback = async () => {
    setIsGeneratingFeedback(true);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationHistory: messages,
          feedbackPersona,
          feedbackInstruction,
        }),
      });

      const data = await response.json();

      if (data.feedback) {
        // Get last user message
        const userMessages = messages.filter(m => m.sender === 'user');
        const lastUserMessage = userMessages.length > 0
          ? userMessages[userMessages.length - 1].text
          : 'No user messages';

        // Create feedback item with metadata
        const feedbackItem: FeedbackItem = {
          feedback: data.feedback,
          messageCount: messages.length,
          lastUserMessage: lastUserMessage.length > 50
            ? lastUserMessage.substring(0, 50) + '...'
            : lastUserMessage,
          timestamp: new Date(),
        };

        // Save current feedback to history if it exists
        if (currentFeedback) {
          setFeedbackHistory(prev => [...prev, currentFeedback]);
        }

        // Set new feedback as current
        setCurrentFeedback(feedbackItem);
        setViewingHistoryIndex(null);

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
        messageCount: messages.length,
        lastUserMessage: 'Error',
        timestamp: new Date(),
      };
      if (currentFeedback) {
        setFeedbackHistory(prev => [...prev, currentFeedback]);
      }
      setCurrentFeedback(errorItem);
      setIsGeneratingFeedback(false);
    }
  };

  const handleSendResponse = () => {
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
        .then(data => {
          const autoReply: Message = {
            id: (Date.now() + 1).toString(),
            text: data.reply || "Sorry, I couldn't respond right now.",
            sender: "other",
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, autoReply]);
          setIsTyping(false);
        })
        .catch(error => {
          console.error('API error:', error);
          setIsTyping(false);
        });
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
      setFeedbackHistory([]);
      setViewingHistoryIndex(null);
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
      setFeedbackHistory([]);
      setViewingHistoryIndex(null);
    }
  };

  const handleReset = () => {
    if (confirm("Are you sure you want to reset this conversation? All messages and feedback will be cleared.")) {
      setMessages(scenarios[currentScenario].presetMessages);
      setResponseText("");
      setIsTyping(false);
      setCurrentFeedback(null);
      setFeedbackHistory([]);
      setViewingHistoryIndex(null);
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
              <Link href="/admin" className="inline-flex items-center text-gray-600 hover:text-gray-900">
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back to Admin
              </Link>
            ) : (
              <Link href="/select-user" className="inline-flex items-center text-gray-600 hover:text-gray-900">
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back
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
                  <button
                    onClick={handleReset}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Reset conversation"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
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

              {/* Chat Input */}
              <div className="bg-white border-t border-gray-200 px-6 py-4 rounded-b-lg">
                <div className="relative">
                  <input
                    type="text"
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendResponse();
                      }
                    }}
                    disabled={isTyping || isGeneratingFeedback}
                    className="w-full pl-6 pr-16 py-4 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:cursor-not-allowed text-base"
                    placeholder="Send a message..."
                  />
                  {responseText.trim() && !isTyping && !isGeneratingFeedback && (
                    <button
                      onClick={handleSendResponse}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-purple-600 rounded-full text-white hover:bg-purple-700 transition-colors"
                    >
                      <Send className="w-5 h-5 fill-current" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Feedback - Right */}
          <div className="flex flex-col">
            {/* Feedback Section */}
            <div className="bg-white rounded-lg shadow p-6 flex flex-col overflow-hidden h-[700px]">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold">RYLAI&apos;s Feedback:</h2>
                  <Button
                    onClick={generateFeedback}
                    disabled={isGeneratingFeedback || messages.length === 0}
                    variant="primary"
                    size="small"
                  >
                    Generate Feedback
                  </Button>
                </div>
                {/* Feedback History Select */}
                {feedbackHistory.length > 0 && (
                  <select
                    value={viewingHistoryIndex === null ? 'current' : viewingHistoryIndex}
                    onChange={(e) => {
                      const value = e.target.value;
                      setViewingHistoryIndex(value === 'current' ? null : parseInt(value));
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                  >
                    <option value="current">
                      Current ({currentFeedback?.messageCount} msgs • &quot;{currentFeedback?.lastUserMessage}&quot;)
                    </option>
                    {feedbackHistory.map((item, index) => (
                      <option key={index} value={index}>
                        History {index + 1} ({item.messageCount} msgs • &quot;{item.lastUserMessage}&quot;)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div
                ref={feedbackContainerRef}
                className="flex-1 overflow-y-auto text-gray-700 min-h-0"
              >
                {!currentFeedback && !isGeneratingFeedback ? (
                  <p className="text-gray-400 italic">
                    Click &quot;Generate Feedback&quot; to get feedback on the entire conversation...
                  </p>
                ) : isGeneratingFeedback ? (
                  <div className="flex items-center space-x-2 text-gray-500">
                    <div className="animate-pulse">●</div>
                    <div className="animate-pulse delay-75">●</div>
                    <div className="animate-pulse delay-150">●</div>
                    <span className="text-sm">Generating feedback...</span>
                  </div>
                ) : (
                  <div className="text-sm whitespace-pre-wrap text-gray-800 leading-relaxed">
                    {viewingHistoryIndex !== null
                      ? feedbackHistory[viewingHistoryIndex].feedback
                      : currentFeedback?.feedback}
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
                {scenarios.map((_, index) => (
                  <div
                    key={index}
                    className={`w-2 h-2 rounded-full transition-all ${
                      index === currentScenario
                        ? "bg-purple-600 w-8"
                        : "bg-gray-300"
                    }`}
                  />
                ))}
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