import { NextRequest, NextResponse } from 'next/server'; 

// IMPORTANT: Change these credentials!
const VALID_CREDENTIALS = {
  username: 'csr_admin',
  password: 'Warehouse307!', // Change this to a secure password
};

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    // Validate credentials
    if (
      username === VALID_CREDENTIALS.username &&
      password === VALID_CREDENTIALS.password
    ) {
      // Generate a simple token (in production, use JWT)
      const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');

      return NextResponse.json({ 
        success: true, 
        token,
        message: 'Login successful' 
      });
    }

    return NextResponse.json(
      { error: 'Invalid username or password' },
      { status: 401 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
