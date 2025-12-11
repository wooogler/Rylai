import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const { username, userType } = await req.json();

    if (!username || !userType) {
      return NextResponse.json(
        { error: 'Username and userType are required' },
        { status: 400 }
      );
    }

    const user = await db.query.users.findFirst({
      where: and(
        eq(users.username, username),
        eq(users.userType, userType as 'admin' | 'user' | 'parent')
      ),
      columns: {
        id: true,
        userType: true
      }
    });

    return NextResponse.json({
      exists: !!user,
      user: user || null
    });
  } catch (error) {
    console.error('Error checking user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
