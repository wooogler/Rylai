"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowLeft, LogOut, Send, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useScenarioStore, type Message } from "../../store/useScenarioStore";
import MessageBubble from "../MessageBubble";
import Avatar from "../Avatar";
import TypingIndicator from "../TypingIndicator";
import Button from "@/components/Button";

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
  const [feedbackItems, setFeedbackItems] = useState<string[]>([]);
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

  const generateFeedback = async (userMessage: string, predatorResponse: string = "") => {
    setIsGeneratingFeedback(true);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationHistory: messages,
          userMessage,
          predatorResponse,
          feedbackPersona,
          feedbackInstruction,
        }),
      });

      const data = await response.json();

      if (data.feedback) {
        setFeedbackItems(prev => [...prev, data.feedback]);

        // Scroll feedback container to bottom
        setTimeout(() => {
          if (feedbackContainerRef.current) {
            feedbackContainerRef.current.scrollTop = feedbackContainerRef.current.scrollHeight;
          }
        }, 100);
      } else {
        throw new Error('No feedback in response');
      }

      setIsGeneratingFeedback(false);
    } catch (error) {
      console.error('Feedback generation error:', error);
      setFeedbackItems(prev => [...prev, 'Failed to generate feedback. Please try again.']);
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

      // Generate feedback immediately after user sends message
      generateFeedback(textToSend);

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
      setFeedbackItems([]);
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
      setFeedbackItems([]);
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
          <h1 className="text-2xl font-bold mb-6">
            RYLAI: Resilient Youth Learn through Artificial Intelligence
          </h1>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Chat Simulation - Left */}
          <div className="flex flex-col">
            <div className="bg-white rounded-lg shadow w-full h-[715px] flex flex-col">
              {/* Chat Header */}
              <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center space-x-3 rounded-t-lg">
                <Avatar seed={scenario.handle} size={40} />
                <div>
                  <p className="font-semibold">{scenario.predatorName}</p>
                  <p className="text-sm text-gray-500">{scenario.handle}</p>
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
            <p className="mt-4 text-center text-lg font-semibold text-gray-700">Scenario {currentScenario + 1} of {scenarios.length}</p>
          </div>

          {/* Feedback - Right */}
          <div className="flex flex-col h-[715px]">
            {/* Feedback Section */}
            <div className="bg-white rounded-lg shadow p-6 flex flex-col mb-6 overflow-hidden" style={{ height: 'calc(100% - 60px)' }}>
              <h2 className="text-lg font-semibold mb-4">RYLAI&apos;s Feedback:</h2>
              <div
                ref={feedbackContainerRef}
                className="flex-1 overflow-y-auto space-y-4 text-gray-700 min-h-0"
              >
                {feedbackItems.length === 0 && !isGeneratingFeedback ? (
                  <p className="text-gray-400 italic">
                    Feedback will appear here after you send a message...
                  </p>
                ) : (
                  <>
                    {feedbackItems.map((feedback, index) => (
                      <div
                        key={index}
                        className="p-3 bg-purple-50 rounded-lg border border-purple-200"
                      >
                        <p className="text-sm font-medium text-purple-900 mb-1">
                          Exchange {index + 1}
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{feedback}</p>
                      </div>
                    ))}
                    {isGeneratingFeedback && (
                      <div className="flex items-center space-x-2 text-gray-500">
                        <div className="animate-pulse">●</div>
                        <div className="animate-pulse delay-75">●</div>
                        <div className="animate-pulse delay-150">●</div>
                        <span className="text-sm">Generating feedback...</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-between items-center">
              <Button
                onClick={handlePreviousScenario}
                disabled={currentScenario === 0}
                variant="ghost"
              >
                <ChevronLeft className="w-5 h-5" />
                Back
              </Button>
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
    </div>
  );
}