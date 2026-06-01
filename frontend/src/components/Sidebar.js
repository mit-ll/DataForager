// Copyright (c) 2026 Massachusetts Institute of Technology
// SPDX-License-Identifier: MIT

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

/**
 * Helper function to slice off old status messages in the log;
 * only keep a certain number of modular, completed actions
 * that exist within a "batch" (e.g., download dataset X --> join dataset X)
 */
function getRecentStatusMessages(messages, completedBatchCount = 3) {
  const terminatedIndices = messages
    .map((m, i) => (m.terminated ? i : null))
    .filter(i => i !== null);

  const batchCutIndex =
    terminatedIndices.length > completedBatchCount
      ? terminatedIndices[terminatedIndices.length - (completedBatchCount + 1)] + 1
      : 0;

  return messages.slice(batchCutIndex);
}

/**
 * The component containing everything in the Sidebar,
 * including AI chat features & status message log
 */
const Sidebar = ({setSearchResultsKG, getWebSources, makeVis, visAttributes, statusMessages, injectedMessage}) => {
  const [statusExpanded, setStatusExpanded] = useState(false); // Indicator for whether the status log is expanded
  const [messageInput, setMessageInput] = useState(''); // Variable for the chat text box user input
  const lastInjectedTimestamp = useRef(null); // Variable to hold the most recent "injected" message timestamp, to avoid duplicates
  const [chatHistory, setChatHistory] = useState([ // The entire chat history passed to the backend and eventually to the OpenAI API
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'assistant', content: 'Hello! I can help you find relevant data attributes, join data tables, and understand or visualize the data.' },
  ]);

  const chatContainerRef = useRef(null);
  const statusMessagesRef = useRef(null);

  useEffect(() => {
    if (!injectedMessage || !injectedMessage.content || !injectedMessage.role || !injectedMessage.timestamp) return;
    const { role, content } = injectedMessage;
    // Skip if already injected
    if (lastInjectedTimestamp.current === injectedMessage.timestamp) return;
    lastInjectedTimestamp.current = injectedMessage.timestamp;
    setChatHistory(prev => [...prev, { role, content }]);
  }, [injectedMessage]);

  /**
   * Deal with when the user submits a message to the AI assistant
   */
  const handleSendMessage = async () => {
    if (messageInput.trim() === '') return;

    const newUserMessage = { role: 'user', content: messageInput };
    const updatedHistory = [...chatHistory, newUserMessage];
    setChatHistory([...updatedHistory, { role: 'assistant', content: '...' }]);
    setMessageInput('');

    try {
      axios.post("http://localhost:5000/chat-with-assistant", {messages: updatedHistory.slice(-25), vis_attributes: visAttributes})
      .then(response => {
        const data = response.data;
        setChatHistory(prev => {
          const withoutPlaceholder = prev.slice(0, -1);
          return [...withoutPlaceholder, { role: 'assistant', content: data.reply }];
        });
        if ("function" in data && data.function === "search_kg_attributes") {
          // setAiRecommendationsKG(data.attributes);
          console.log(data.all_results);
          setSearchResultsKG(data.all_results);
        } else if ("function" in data && data.function === "search_web") {
          getWebSources(data.web_query);
        } else if ("function" in data && data.function === "make_vis") {
          makeVis(data.spec);
        }
      });
    } catch (err) {
      console.error('Error:', err);
      setChatHistory(prev => {
        const withoutPlaceholder = prev.slice(0, -1);
        return [...withoutPlaceholder, { role: 'assistant', content: 'Error getting response from server.' }];
      });
    } finally {
    }
  };

  /**
   * Track changes in the user's input message
   * and send the message on 'Enter'
   */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSendMessage();
  };

  // Scroll to bottom of chat whenever chatHistory updates
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [chatHistory]);

  // Scroll to bottom of (expanded) status log on status updates
  useEffect(() => {
    if (statusExpanded && statusMessagesRef.current) {
      statusMessagesRef.current.scrollTo({
        top: statusMessagesRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [statusMessages, statusExpanded]);

  return (
    // Container for whole sidebar
    <div className="sidebar">
      <h2 className="sidebar-title">✨ AI Assistant ✨</h2>

      {/* The chat window itself with the chat bubbles */}
      <div className="chat-window" ref={chatContainerRef}>
        {chatHistory
          .filter(m => m.role !== 'system')
          .map((msg, idx) => (
            <div
              key={idx}
              className={`chat-bubble ${msg.role === 'user' ? 'user' : 'assistant'}`}
            >
              {msg.content}
            </div>
        ))}
      </div>

      {/* Where the user can input and send messages */}
      <div className="input-area">
        <input
          type="text"
          id="chat-input"
          placeholder="Type a message..."
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button onClick={handleSendMessage} style={{fontWeight: 'bold'}}>Send</button>
      </div>

      {/* The entire status log container */}
      <div className={`status-box ${statusExpanded ? 'expanded' : ''}`}>
        {/* The status log header with expand button */}
        <div className="status-header">
          <strong>
            Status
            {!statusMessages.at(-1)?.terminated && <span className="status-spinner" />}
          </strong>

          {statusMessages.length > 1 && (
            <button
              className="expand-btn"
              onClick={() => setStatusExpanded(prev => !prev)}
            >
              {statusExpanded ? 'Collapse ▲' : 'Expand ▼'}
            </button>
          )}
        </div>
        {/* The actual status messages */}
        <div className="status-messages" ref={statusMessagesRef}>
          {statusExpanded ? (
            [...getRecentStatusMessages(statusMessages)].reverse().map((s, i, arr) => (
              <React.Fragment key={i}>
                {s.terminated && i !== 0 && (
                  <div className="status-separator" />
                )}
                <div className="status-line bulleted">
                  {s.message}
                </div>
              </React.Fragment>
            ))
          ) : (
            <div className="status-line">
              {statusMessages.at(-1)?.message || "No status."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


export default Sidebar;
