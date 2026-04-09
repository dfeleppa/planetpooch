"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  subsectionTitle: string;
  moduleId: string;
  moduleTitle: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;

    setLoading(true);
    setSearched(true);
    const res = await fetch(`/api/lessons/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setResults(data);
    setLoading(false);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Search Lessons</h1>
      <p className="text-gray-500 mt-1">Search across all lesson content</p>

      <form onSubmit={handleSearch} className="mt-6 flex gap-3">
        <div className="flex-1">
          <Input
            id="search"
            placeholder="Search for topics, keywords..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={loading || query.trim().length < 2}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      <div className="mt-6 space-y-3">
        {results.map((result) => (
          <Card key={result.id} className="hover:shadow-md transition-shadow">
            <CardContent className="py-4">
              <Link href={`/modules/${result.moduleId}/lessons/${result.id}`} className="block">
                <h3 className="font-medium text-gray-900 hover:text-blue-600">{result.title}</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {result.moduleTitle} &gt; {result.subsectionTitle}
                </p>
                {result.snippet && (
                  <p className="text-sm text-gray-500 mt-2 line-clamp-2">{result.snippet}</p>
                )}
              </Link>
            </CardContent>
          </Card>
        ))}

        {searched && !loading && results.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No results found for &ldquo;{query}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}
