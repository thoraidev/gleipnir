'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SearchBar() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = input.trim();
    if (!addr) return;
    setLoading(true);

    if (/^0x[a-fA-F0-9]{40}$/i.test(addr)) {
      router.push(`/report/${addr.toLowerCase()}`);
    } else {
      // TODO: ENS resolution via Alchemy/public RPC
      alert('Please enter a valid Ethereum address (0x…). ENS resolution coming soon.');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="0x… contract address or protocol.eth"
        className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono text-sm transition-colors"
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="submit"
        disabled={loading || !input.trim()}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap"
      >
        {loading ? 'Analyzing…' : 'Analyze →'}
      </button>
    </form>
  );
}
