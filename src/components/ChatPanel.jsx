import React, { useRef, useEffect } from 'react';

export default function ChatPanel({ messages, input, onInputChange, onSubmit }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-container">
      <div className="chat-header">Chat</div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">No messages yet</div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className="chat-line">
            <span className="chat-sender">{msg.from}{msg.isYou ? ' (you)' : ''}:</span>
            <span className="chat-text">{msg.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={onSubmit} className="chat-input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Type a message..."
          className="chat-input"
        />
        <button type="submit" className="chat-send">Send</button>
      </form>
    </div>
  );
}
