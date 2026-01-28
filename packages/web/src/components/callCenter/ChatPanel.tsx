import { useState, useCallback, useRef, useEffect } from 'react'
import { ChatMessageType } from '@streamvu/shared'
import type { ChatMessage } from '@streamvu/shared'

interface ChatPanelProps {
  roomId: string
  currentUserId: string
  currentUserName: string
  isHost: boolean
  messages: ChatMessage[]
  participants: Array<{ participantId: string; displayName: string; userId?: string | null }>
  onSendMessage: (content: string, recipientId?: string, type?: ChatMessageType) => void
}

const MESSAGE_TYPE_STYLES: Record<ChatMessageType, { bg: string; text: string; label?: string }> = {
  CHAT: { bg: 'bg-gray-800', text: 'text-gray-300' },
  PRODUCER_NOTE: { bg: 'bg-yellow-950/50', text: 'text-yellow-300', label: 'NOTE' },
  SYSTEM: { bg: 'bg-blue-950/50', text: 'text-blue-300', label: 'SYS' },
}

function formatTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function ChatMessageBubble({
  message,
  isOwn,
  showSender,
}: {
  message: ChatMessage
  isOwn: boolean
  showSender: boolean
}) {
  const styles = MESSAGE_TYPE_STYLES[message.type]
  const isPrivate = !!message.recipientId

  return (
    <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
      {showSender && !isOwn && (
        <span className="mb-0.5 ml-1 text-[9px] font-mono uppercase tracking-wider text-gray-600">
          {message.senderName}
        </span>
      )}
      <div
        className={`
          max-w-[85%] px-2 py-1
          ${isOwn ? 'bg-primary-900/50 text-primary-200' : styles.bg + ' ' + styles.text}
          ${isPrivate ? 'border-l-2 border-dashed border-gray-600' : ''}
        `}
      >
        {/* Type Label */}
        {styles.label && (
          <div className="text-[8px] font-mono uppercase tracking-wider opacity-70">{styles.label}</div>
        )}
        {isPrivate && (
          <div className="text-[8px] font-mono uppercase tracking-wider text-gray-500">DM</div>
        )}

        {/* Content */}
        <p className="whitespace-pre-wrap break-words text-[11px]">{message.content}</p>

        {/* Time */}
        <div className="mt-0.5 text-right font-mono text-[8px] text-gray-600">
          {formatTime(message.createdAt)}
        </div>
      </div>
    </div>
  )
}

export function ChatPanel({
  roomId: _roomId,
  currentUserId,
  currentUserName: _currentUserName,
  isHost,
  messages,
  participants,
  onSendMessage,
}: ChatPanelProps) {
  const [content, setContent] = useState('')
  const [recipientId, setRecipientId] = useState<string>('')
  const [messageType, setMessageType] = useState<ChatMessageType>(ChatMessageType.CHAT)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(() => {
    if (!content.trim()) return

    onSendMessage(
      content.trim(),
      recipientId || undefined,
      messageType
    )
    setContent('')
  }, [content, recipientId, messageType, onSendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-2 py-1.5">
        <h3 className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Chat</h3>
        <span className="text-[9px] font-mono text-gray-600">{messages.length}</span>
      </div>

      {/* Messages List */}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {messages.length === 0 && (
          <p className="py-8 text-center text-[10px] font-mono text-gray-600">NO MESSAGES</p>
        )}

        {messages.map((message, idx) => {
          const isOwn = message.senderId === currentUserId
          const prevMessage = messages[idx - 1]
          const showSender = !prevMessage || prevMessage.senderId !== message.senderId

          return (
            <ChatMessageBubble
              key={message.id}
              message={message}
              isOwn={isOwn}
              showSender={showSender}
            />
          )
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-800 p-1.5">
        {/* Options Row (Host Only) */}
        {isHost && (
          <div className="mb-1.5 flex gap-1">
            <select
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              className="bg-gray-900 px-1.5 py-0.5 text-[10px] font-mono text-gray-400 focus:outline-none"
            >
              <option value="">ALL</option>
              {participants.map((p) => (
                <option key={p.participantId} value={p.participantId}>
                  {p.displayName}
                </option>
              ))}
            </select>

            <select
              value={messageType}
              onChange={(e) => setMessageType(e.target.value as ChatMessageType)}
              className="bg-gray-900 px-1.5 py-0.5 text-[10px] font-mono text-gray-400 focus:outline-none"
            >
              <option value="CHAT">CHAT</option>
              <option value="PRODUCER_NOTE">NOTE</option>
            </select>
          </div>
        )}

        {/* Message Input */}
        <div className="flex gap-1">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message..."
            rows={1}
            className="flex-1 resize-none bg-gray-900 px-2 py-1.5 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-700"
          />
          <button
            onClick={handleSend}
            disabled={!content.trim()}
            className="bg-primary-900/50 px-2 py-1.5 text-[10px] font-mono text-primary-400 hover:bg-primary-900/70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            SEND
          </button>
        </div>
      </div>
    </div>
  )
}

// Compact chat for sidebar
export function ChatCompact({
  messages,
  currentUserId,
  onSendMessage,
}: {
  messages: ChatMessage[]
  currentUserId: string
  onSendMessage: (content: string) => void
}) {
  const [content, setContent] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!content.trim()) return
    onSendMessage(content.trim())
    setContent('')
  }

  const recentMessages = messages.slice(-10)

  return (
    <div className="bg-gray-900 p-1.5">
      <h4 className="mb-1 px-0.5 text-[9px] font-mono uppercase tracking-wider text-gray-600">
        Chat
      </h4>

      <div className="mb-1.5 max-h-24 space-y-0.5 overflow-y-auto">
        {recentMessages.map((msg) => (
          <div key={msg.id} className="text-[10px]">
            <span className={msg.senderId === currentUserId ? 'text-primary-500' : 'text-gray-500'}>
              {msg.senderName}:
            </span>{' '}
            <span className="text-gray-400">{msg.content}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-1">
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Message..."
          className="flex-1 bg-gray-800 px-1.5 py-1 text-[10px] text-white placeholder-gray-600 focus:outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!content.trim()}
          className="bg-primary-900/50 px-1.5 py-1 text-[10px] text-primary-400 hover:bg-primary-900/70 disabled:opacity-50"
        >
          →
        </button>
      </div>
    </div>
  )
}
