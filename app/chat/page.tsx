"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { scenarios, type Message } from "./scenarios";
import MessageBubble from "./MessageBubble";
import Avatar from "./Avatar";
import TypingIndicator from "./TypingIndicator";

export default function ChatPage() {
  const [currentScenario, setCurrentScenario] = useState(0);
  const [messages, setMessages] = useState<Message[]>(scenarios[0].messages);
  const [responseText, setResponseText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [replyIndex, setReplyIndex] = useState(0);
  const [phoneInputText, setPhoneInputText] = useState("");
  const [isSimulatingTyping, setIsSimulatingTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSendResponse = () => {
    if (responseText.trim() && !isTyping && !isSimulatingTyping) {
      const textToSend = responseText;
      setResponseText("");
      setIsSimulatingTyping(true);

      // Simulate typing in phone input
      let currentIndex = 0;
      const typingSpeed = 50; // ms per character

      const typeInterval = setInterval(() => {
        if (currentIndex <= textToSend.length) {
          setPhoneInputText(textToSend.slice(0, currentIndex));
          currentIndex++;
        } else {
          clearInterval(typeInterval);

          // Wait 1 second after typing completes before sending
          setTimeout(() => {
            // Add message to chat
            const newMessage: Message = {
              id: Date.now().toString(),
              text: textToSend,
              sender: "user",
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, newMessage]);
            setPhoneInputText("");
            setIsSimulatingTyping(false);

            // Show typing indicator and auto-reply after 3 seconds
            setIsTyping(true);
            setTimeout(() => {
              const scenario = scenarios[currentScenario];
              const reply = scenario.autoReplies[replyIndex % scenario.autoReplies.length];
              const autoReply: Message = {
                id: (Date.now() + 1).toString(),
                text: reply,
                sender: "other",
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, autoReply]);
              setIsTyping(false);
              setReplyIndex(prev => prev + 1);
            }, 3000);
          }, 500);
        }
      }, typingSpeed);
    }
  };

  const handlePreviousScenario = () => {
    if (currentScenario > 0) {
      const prevScenario = currentScenario - 1;
      setCurrentScenario(prevScenario);
      setMessages(scenarios[prevScenario].messages);
      setResponseText("");
      setIsTyping(false);
      setReplyIndex(0);
      setPhoneInputText("");
      setIsSimulatingTyping(false);
    }
  };

  const handleNextScenario = () => {
    if (currentScenario < scenarios.length - 1) {
      const nextScenario = currentScenario + 1;
      setCurrentScenario(nextScenario);
      setMessages(scenarios[nextScenario].messages);
      setResponseText("");
      setIsTyping(false);
      setReplyIndex(0);
      setPhoneInputText("");
      setIsSimulatingTyping(false);
    }
  };

  const scenario = scenarios[currentScenario];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link href="/" className="inline-flex items-center text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </Link>
          <h1 className="text-2xl font-bold mt-4">
            Educational Intervention about Online Unwanted Sexual Solicitations
          </h1>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Phone Simulation - Left */}
          <div className="flex flex-col items-center">
            <div className="bg-gray-900 rounded-[3rem] p-4 shadow-2xl w-full max-w-[375px]">
              <div className="bg-white rounded-[2.5rem] overflow-hidden h-[667px] flex flex-col">
                {/* Phone Status Bar */}
                <div className="bg-white px-6 py-2 flex justify-between items-center text-xs">
                  <span>10:39</span>
                  <div className="flex items-center space-x-1">
                    <div className="w-4 h-3 bg-gray-300 rounded-sm"></div>
                    <div className="w-4 h-3 bg-gray-300 rounded-sm"></div>
                    <div className="w-4 h-3 bg-gray-300 rounded-sm"></div>
                  </div>
                </div>

                {/* Chat Header */}
                <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <ChevronLeft className="w-6 h-6" />
                    <Avatar seed={scenario.handle} size={32} />
                    <div>
                      <p className="font-semibold text-sm">{scenario.username}</p>
                      <p className="text-xs text-gray-500">{scenario.handle}</p>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 bg-white scroll-smooth">
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

                {/* Phone Input (disabled for mockup) */}
                <div className="bg-white border-t border-gray-200 px-4 py-3">
                  <div className="bg-gray-100 rounded-full px-4 py-2 text-sm">
                    {phoneInputText ? (
                      <span className="text-gray-900">{phoneInputText}</span>
                    ) : (
                      <span className="text-gray-400">Send a message...</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-600">Scenario {currentScenario + 1} of {scenarios.length}</p>
          </div>

          {/* Response & Feedback - Right */}
          <div className="flex flex-col h-[715px]">
            {/* Response Section */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Respond to this person:</h2>
              <div className="flex gap-3">
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
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Type your response here..."
                />
                <button
                  onClick={handleSendResponse}
                  disabled={!responseText.trim()}
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </div>
            </div>

            {/* Feedback Section */}
            <div className="bg-white rounded-lg shadow p-6 flex-1 flex flex-col mb-6">
              <h2 className="text-lg font-semibold mb-4">Feedback:</h2>
              <div className="flex-1 overflow-y-auto space-y-2 text-gray-700">
                <p>Acknowledge current CG stage</p>
                <p>Vulnerable Behavior Identification</p>
                <p>Protective Strategy Identification</p>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-between items-center">
              <button
                onClick={handlePreviousScenario}
                disabled={currentScenario === 0}
                className="flex items-center text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
                Back
              </button>
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
              <button
                onClick={handleNextScenario}
                disabled={currentScenario === scenarios.length - 1}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}