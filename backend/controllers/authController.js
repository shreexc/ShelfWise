import User from "../models/User.js";
import { generate } from "otp-generator";
import sendOTP from "../utils/sendOTP.js";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";

// Student registration and OTP sending
export async function registerUser(req, res) {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cleanPhone = phone.toString().replace(/\D/g, "");

    if (cleanPhone.length !== 10) {
      return res.status(400).json({
        message: "Invalid mobile number",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      if (existingUser.isVerified) {
        return res.status(400).json({
          message: "User already exists",
        });
      }

      await User.deleteOne({ _id: existingUser._id });
    }

    const otp = generate(6, {
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars: false,
      digits: true,
    });

    try {
      await sendOTP(normalizedEmail, otp);
    } catch (emailError) {
      console.error("Error sending OTP email:", emailError);
      return res.status(500).json({
        message: "Failed to send OTP. Please try again.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
    const studentID = `ST-${uuidv4().slice(0, 8).toUpperCase()}`;

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: cleanPhone,
      password: hashedPassword,
      otp,
      otpExpiry,
      studentID,
    });

    return res.status(201).json({
      message: "Registration successful. Check your email for OTP.",
      otp: otp,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        studentID: user.studentID,
      },
    });
  } catch (error) {
    console.error("Error registering user:", error);

    return res.status(500).json({
      message: "Error registering user",
    });
  }
}

// OTP verification
export async function verifyOTP(req, res) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        message: "Email and OTP are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        message: "Email is already verified",
      });
    }

    if (
      !user.otp ||
      String(user.otp) !== String(otp).trim() ||
      !user.otpExpiry ||
      Date.now() > new Date(user.otpExpiry).getTime()
    ) {
      return res.status(400).json({
        message: "Invalid or expired OTP",
      });
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;

    await user.save();

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured");
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "15m" },
    );

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      token,
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);

    return res.status(500).json({
      message: "Error verifying OTP",
    });
  }
}

// Profile completion
export async function completeProfile(req, res) {
  try {
    const { department, stream, semester, rollNo } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        message: "User is not verified",
      });
    }

    if (!department || !stream || !semester || !rollNo) {
      return res.status(400).json({
        message: "All profile fields are required",
      });
    }

    user.department = department;
    user.stream = stream;
    user.semester = semester;
    user.rollNo = rollNo;
    user.isProfileComplete = true;

    await user.save();

    return res.status(200).json({
      message: "Profile completed successfully",
    });
  } catch (error) {
    console.error("Error completing profile:", error);

    return res.status(500).json({
      message: "Error completing profile",
    });
  }
}

// Login
export async function loginUser(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email with OTP",
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured");
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.otp;
    delete userResponse.otpExpiry;

    return res.status(200).json({
      success: true,
      token,
      user: userResponse,
    });
  } catch (error) {
    console.error("Error during login:", error);

    return res.status(500).json({
      success: false,
      message: "Error during login",
    });
  }
}

// Get profile
export async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user.id).select(
      "-password -otp -otpExpiry",
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Error fetching profile:", error);

    return res.status(500).json({
      message: "Error fetching user profile",
    });
  }
}

// Update profile
export async function updateProfile(req, res) {
  try {
    const { name, email, phone, department, stream, semester, rollNumber } =
      req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (email) {
      const normalizedEmail = email.trim().toLowerCase();

      if (normalizedEmail !== user.email.toLowerCase()) {
        if (user.role === "user") {
          return res.status(400).json({
            message: "Students are not allowed to change their email address",
          });
        }

        const existingUser = await User.findOne({
          email: normalizedEmail,
          _id: { $ne: user._id },
        });

        if (existingUser) {
          return res.status(400).json({
            message: "Email already in use",
          });
        }

        user.email = normalizedEmail;
      }
    }

    if (phone !== undefined) {
      const cleanPhone = phone.toString().replace(/\D/g, "");

      if (cleanPhone.length !== 10) {
        return res.status(400).json({
          message: "Mobile number must be exactly 10 digits",
        });
      }

      user.phone = cleanPhone;
    }

    if (name !== undefined) user.name = name;
    if (department !== undefined) user.department = department;
    if (stream !== undefined) user.stream = stream;
    if (semester !== undefined) user.semester = semester;
    if (rollNumber !== undefined) user.rollNo = rollNumber;

    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.otp;
    delete userResponse.otpExpiry;

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: userResponse,
    });
  } catch (error) {
    console.error("Error updating profile:", error);

    return res.status(500).json({
      message: "Error updating profile",
    });
  }
}

// Get all verified and completed student accounts (admin)
export async function getUsers(req, res) {
  try {
    const users = await User.find({
      role: "user",
      isVerified: true,
      isProfileComplete: true,
    }).select("-password -otp -otpExpiry");

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Error fetching students:", error);

    return res.status(500).json({
      message: "Error fetching students",
    });
  }
}

// Admin registration

export async function registerAdmin(req, res) {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (await User.findOne({ email })) {
      return res.status(400).json({
        message: "Email already exists",
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone,
      password: hashedPassword,
      role: "admin",
      isVerified: true,
    });
    const { password: _, ...userResponse } = user.toObject();
    res.status(201).json({
      success: true,
      message: "Admin registered successfully",
      user: userResponse,
    });
  } catch (error) {
    console.error("Error registering admin:", error);

    return res.status(500).json({
      message: "Error registering admin",
    });
  }
}
