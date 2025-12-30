import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from "firebase/auth";
import { auth, googleProvider, firebaseConfig } from "./firebaseConfig";

const API_BASE =
  process.env.REACT_APP_API_BASE || "http://localhost:4001";

// Always force account chooser
googleProvider.setCustomParameters({ prompt: "select_account" });

export default function WelcomePage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [useRedirect, setUseRedirect] = useState(false);

  // --------------------------------------------------
  // Handle Google redirect sign-in (Vercel safe)
  // --------------------------------------------------
  useEffect(() => {
    const handleRedirectLogin = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (!result?.user) return;

        const role =
          sessionStorage.getItem("signInRole") || "student";

        await completeLogin(result.user, role);
      } catch (err) {
        console.error("Redirect sign-in failed:", err);
        setError("Failed to complete Google sign-in.");
      }
    };

    handleRedirectLogin();
  }, []);

  // --------------------------------------------------
  // Final login completion
  // --------------------------------------------------
  const completeLogin = async (user, role) => {
    try {
      const payload = {
        uid: user.uid,
        email: user.email || "",
        display_name: user.displayName || user.email,
        role,
      };

      const res = await fetch(`${API_BASE}/auth/upsert-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Backend authentication failed");
      }

      const data = await res.json();

      // Persist session
      localStorage.setItem("user_id", data.user_id);
      localStorage.setItem("user_role", role);
      localStorage.setItem("user_email", user.email);

      // ✅ CORRECT ROUTES (matches your router)
      navigate(
        role === "teacher"
          ? "/teacher-game-management"
          : "/gamepage",
        { replace: true }
      );
    } catch (err) {
      console.error("Login completion error:", err);
      setError(err.message || "Login failed.");
    }
  };

  // --------------------------------------------------
  // Google sign-in handler
  // --------------------------------------------------
  const handleSignIn = async (role) => {
    setError("");
    setLoading(true);

    try {
      if (useRedirect) {
        sessionStorage.setItem("signInRole", role);
        await signInWithRedirect(auth, googleProvider);
        return;
      }

      const result = await signInWithPopup(auth, googleProvider);
      if (!result?.user) {
        throw new Error("No user returned from Google");
      }

      await completeLogin(result.user, role);
    } catch (err) {
      console.error("Google sign-in error:", err);

      if (err.code === "auth/popup-blocked") {
        sessionStorage.setItem("signInRole", role);
        setUseRedirect(true);
        await signInWithRedirect(auth, googleProvider);
        return;
      }

      setError(err.message || "Google sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------
  // UI
  // --------------------------------------------------
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-md p-8 bg-gray-800 rounded-2xl border border-gray-700">
        <h1 className="text-4xl font-bold text-cyan-400 text-center mb-2">
          Wisdom Warfare
        </h1>
        <p className="text-center text-gray-300 mb-8">
          Interactive Gamified Learning Platform
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 text-red-200 rounded-lg">
            {error}
          </div>
        )}

        <button
          onClick={() => handleSignIn("student")}
          disabled={loading}
          className="w-full mb-4 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
        >
          {loading ? "Signing in..." : "Sign in as Student"}
        </button>

        <button
          onClick={() => handleSignIn("teacher")}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold"
        >
          {loading ? "Signing in..." : "Sign in as Teacher"}
        </button>

        <div className="mt-6 text-center text-sm text-gray-400">
          <button
            onClick={() => setUseRedirect(!useRedirect)}
            className="underline text-cyan-300"
          >
            Switch to {useRedirect ? "Popup" : "Redirect"} method
          </button>
        </div>

        <div className="mt-6 text-xs text-gray-500">
          Firebase Auth Domain:{" "}
          <span className="text-green-400">
            {firebaseConfig.authDomain}
          </span>
        </div>
      </div>
    </div>
  );
}
