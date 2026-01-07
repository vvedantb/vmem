import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, validatePassword, generateToken, toPublicUser } from "../store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Find user
    const user = findUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Validate password
    if (!validatePassword(user, password)) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Generate token and return user data
    const token = generateToken(user.id);

    return NextResponse.json({
      success: true,
      data: {
        token,
        user: toPublicUser(user),
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
