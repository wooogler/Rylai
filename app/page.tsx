import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-purple-50 to-white">
      <main className="text-center space-y-8 p-8">
        <h1 className="text-5xl font-bold text-gray-900">
          CG Interface
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl">
          Educational intervention about online unwanted sexual solicitations
        </p>
        <div className="pt-4">
          <Link
            href="/chat"
            className="inline-block px-8 py-4 bg-purple-600 text-white rounded-full font-semibold hover:bg-purple-700 transition-colors"
          >
            Start Chat Scenario
          </Link>
        </div>
      </main>
    </div>
  );
}
