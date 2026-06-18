import { OpenAI } from 'openai';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { runFeedbackModel } from '@/lib/feedback-runner';

// Admin-only: run the feedback model on a fully-assembled prompt string (the exact
// preview from the admin editor) and return the structured result. This lets educators
// test their (possibly unsaved) prompt changes against the real model.
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const me = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { userType: true },
    });
    if (me?.userType !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { input } = await req.json();
    if (typeof input !== 'string' || !input.trim()) {
      return NextResponse.json({ error: 'input is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
    }
    const openai = new OpenAI({ apiKey });

    const result = await runFeedbackModel(openai, input);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Feedback test API error:', error);
    return NextResponse.json({ error: 'Failed to run test' }, { status: 500 });
  }
}
