'use client';

import { useParams } from 'next/navigation';

/**
 * Review submission page.
 *
 * Customers land here after clicking the review link in their email.
 * The page validates the token, fetches product info, and presents
 * a review form (star rating, title, body, name).
 */
export default function SubmitReviewPage() {
  const { token } = useParams<{ token: string }>();

  // TODO: Fetch product info and validate token via GET /api/review-submission/[token]
  // TODO: Build review submission form
  // TODO: Submit review via POST /api/review-submission/[token]
  // TODO: Show thank-you confirmation after successful submission

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold mb-2">Leave a Review</h1>
        <p className="text-gray-500 mb-8">
          Share your experience with this product.
        </p>

        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Rating</label>
            <p className="text-gray-400 text-sm">Star rating selector will go here.</p>
          </div>

          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-1">
              Title
            </label>
            <input
              id="title"
              type="text"
              className="w-full border rounded px-3 py-2"
              placeholder="Summarize your experience"
              maxLength={255}
            />
          </div>

          <div>
            <label htmlFor="body" className="block text-sm font-medium mb-1">
              Review
            </label>
            <textarea
              id="body"
              className="w-full border rounded px-3 py-2"
              rows={4}
              placeholder="Tell others about your experience"
              maxLength={5000}
            />
          </div>

          <div>
            <label htmlFor="authorName" className="block text-sm font-medium mb-1">
              Your name
            </label>
            <input
              id="authorName"
              type="text"
              className="w-full border rounded px-3 py-2"
              placeholder="Jane Doe"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white rounded px-4 py-2 font-medium hover:bg-blue-700"
          >
            Submit Review
          </button>
        </form>

        <p className="mt-4 text-xs text-gray-400">Token: {token}</p>
      </div>
    </main>
  );
}
