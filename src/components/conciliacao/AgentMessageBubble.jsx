import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

function ToolCallLine({ toolCall }) {
  const running = ['pending', 'running', 'in_progress'].includes(toolCall.status);
  const failed = ['failed', 'error'].includes(toolCall.status) || /error|failed/i.test(String(toolCall.results || ''));
  const StatusIcon = running ? Loader2 : failed ? XCircle : CheckCircle2;
  const color = running ? 'text-blue-400' : failed ? 'text-red-400' : 'text-green-400';
  const dp = toolCall.display_projection;
  const label = dp?.hide_details
    ? (running ? dp.active_label : failed ? dp.error_label : dp.label)
    : toolCall.name;
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400 mt-1.5">
      <StatusIcon className={`w-3.5 h-3.5 ${color} ${running ? 'animate-spin' : ''}`} />
      <span className="font-mono">{label}</span>
    </div>
  );
}

export default function AgentMessageBubble({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${isUser ? 'bg-blue-600 text-white' : 'bg-slate-700/60 text-slate-200'}`}>
        {message.content && (isUser
          ? <p>{message.content}</p>
          : <ReactMarkdown className="prose prose-sm prose-invert max-w-none">{message.content}</ReactMarkdown>)}
        {message.tool_calls?.map((tc, i) => <ToolCallLine key={i} toolCall={tc} />)}
      </div>
    </div>
  );
}