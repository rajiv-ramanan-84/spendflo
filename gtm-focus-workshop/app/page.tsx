'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createWorkshop, joinWorkshop } from '@/lib/data';

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [companyContext, setCompanyContext] = useState('');
  const [facilitatorName, setFacilitatorName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name || !goal || !facilitatorName) {
      setError('Workshop name, goal, and your name are required.');
      return;
    }
    setLoading(true);
    try {
      const workshop = await createWorkshop({ name, goal, companyContext, createdBy: facilitatorName });
      const participant = await joinWorkshop(workshop.id, facilitatorName, 'facilitator');
      router.push(`/w/${workshop.id}/lobby?token=${participant.inviteToken}&pid=${participant.id}`);
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong creating the workshop.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">GTM Focus Workshop</h1>
      <p className="mt-2 text-gray-600">
        A guided, evidence-backed workshop for deciding which segment / persona / problem your team should double down
        on - with an AI facilitator and evidence coach, live multiplayer cards, and an exportable GTM Focus Brief.
      </p>

      <form onSubmit={handleCreate} className="mt-10 space-y-5 rounded-xl border border-gray-200 bg-white p-6 card-shell">
        <h2 className="text-lg font-semibold">Create a new workshop</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700">Workshop name</label>
          <input
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Q3 GTM Focus Workshop"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Workshop goal</label>
          <textarea
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            rows={2}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Decide the two GTM combinations we double down on for the next two quarters."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Company context (for the AI facilitator)</label>
          <textarea
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            rows={3}
            value={companyContext}
            onChange={(e) => setCompanyContext(e.target.value)}
            placeholder="What we sell, current ICP hypotheses, stage of the company, relevant constraints..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Your name (facilitator)</label>
          <input
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            value={facilitatorName}
            onChange={(e) => setFacilitatorName(e.target.value)}
            placeholder="Rajiv"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create workshop'}
        </button>
      </form>

      <p className="mt-6 text-xs text-gray-400">
        MVP access model: anyone with the room link (including its invite token) can join. There is no account login yet -
        see the README for what is deferred.
      </p>
    </main>
  );
}
