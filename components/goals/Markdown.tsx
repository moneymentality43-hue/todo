import React from 'react';

// Small markdown renderer that builds React elements (never raw HTML), so user text cannot inject markup.

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;

    if (token.startsWith('`')) {
      nodes.push(<code key={key} className="px-1 py-0.5 rounded bg-neutral-800 text-neutral-200 font-mono text-[0.85em]">{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key} className="font-semibold text-white">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)!;
      if (SAFE_LINK.test(m[2])) {
        nodes.push(<a key={key} href={m[2]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-white hover:text-neutral-300">{m[1]}</a>);
      } else {
        nodes.push(token);
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export default function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') { i++; continue; }

    if (line.startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++;
      blocks.push(<pre key={k++} className="rounded-lg bg-black border border-neutral-800 p-3 overflow-x-auto text-xs font-mono text-neutral-300">{code.join('\n')}</pre>);
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const cls = level === 1 ? 'text-xl font-semibold' : level === 2 ? 'text-lg font-semibold' : 'text-base font-semibold';
      blocks.push(<div key={k++} role="heading" aria-level={level} className={`font-headline text-white ${cls}`}>{renderInline(heading[2], `h${k}`)}</div>);
      i++;
      continue;
    }

    if (/^\s*([-*])\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*])\s+/, ''));
      blocks.push(<ul key={k++} className="list-disc pl-5 space-y-1">{items.map((t, n) => <li key={n}>{renderInline(t, `u${k}-${n}`)}</li>)}</ul>);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''));
      blocks.push(<ol key={k++} className="list-decimal pl-5 space-y-1">{items.map((t, n) => <li key={n}>{renderInline(t, `o${k}-${n}`)}</li>)}</ol>);
      continue;
    }

    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={k++} className="border-l-2 border-neutral-600 pl-3 text-neutral-400 italic">{renderInline(quote.join(' '), `q${k}`)}</blockquote>);
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push(<hr key={k++} className="border-neutral-800" />);
      i++;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,3}\s|```|>|\s*([-*]|\d+\.)\s+)/.test(lines[i])) para.push(lines[i++]);
    if (para.length === 0) para.push(lines[i++]);
    blocks.push(<p key={k++}>{renderInline(para.join(' '), `p${k}`)}</p>);
  }

  if (blocks.length === 0) return <p className="text-neutral-600 italic">Nothing to preview yet.</p>;
  return <div className="space-y-3 text-sm leading-relaxed text-neutral-300 break-words">{blocks}</div>;
}
