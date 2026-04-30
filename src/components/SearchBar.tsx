'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SearchBar() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = input.trim();
    if (!addr) return;
    setError('');

    if (/^0x[a-fA-F0-9]{40}$/i.test(addr)) {
      setLoading(true);
      router.push(`/report/${addr.toLowerCase()}`);
    } else {
      // TODO: ENS resolution via Alchemy/public RPC
      setError('Please enter a valid Ethereum address starting with 0x. ENS resolution is coming soon.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-2">
      <div className="flex gap-2 w-full">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (error) setError('');
          }}
          placeholder="0x… contract address or protocol.eth"
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono text-sm transition-colors aria-[invalid=true]:border-red-500/70"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'address-error' : undefined}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap"
        >
          {loading ? 'Analyzing…' : 'Analyze →'}
        </button>
      </div>
      {error && (
        <p id="address-error" className="text-left text-sm text-red-300">
          {error}
        </p>
      )}
    </form>
  );
}
