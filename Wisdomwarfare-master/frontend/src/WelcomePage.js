import React, { useState, useEffect } from "react";
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult 
} from "firebase/auth";
import { auth, googleProvider } from "./firebaseConfig"; // Import the provider

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5000/api";

export default function WelcomePage({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [useRedirect, setUseRedirect] = useState(false);

  // Handle redirect result on page load
  useEffect(() => {
    const handleRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          const role = sessionStorage.getItem('signInRole') || 'student';
          await completeLogin(result.user, role);
        }
      } catch (error) {
        console.error("Redirect error:", error);
        setErr("Failed to complete sign-in after redirect");
      }
    };
    
    handleRedirect();
  }, []);

  const completeLogin = async (user, role) => {
    try {
      const payload = {
        uid: user.uid,
        email: user.email || "",
        display_name: user.displayName || user.email || "User",
        role: role,
      };

      const res = await fetch(`${API_BASE}/auth/upsert-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Backend authentication failed");
      
      const data = await res.json();
      
      const userObj = {
        user_id: data.user_id,
        uid: user.uid,
        email: user.email,
        display_name: user.displayName || user.email,
        role: role,
      };

      localStorage.setItem('user_id', data.user_id);
      localStorage.setItem('user_role', role);
      localStorage.setItem('user_email', user.email);

      if (onLogin) onLogin(userObj, role);
      
    } catch (error) {
      console.error("Complete login error:", error);
      setErr(error.message);
    }
  };

  const handleSignIn = async (role) => {
    setErr("");
    setLoading(true);

    try {
      if (useRedirect) {
        // Use redirect method
        sessionStorage.setItem('signInRole', role);
        await signInWithRedirect(auth, googleProvider);
        return; // Will be handled by useEffect
      }

      // Use popup method
      console.log(`Attempting sign-in as ${role}...`);
      
      // Quick popup test
      try {
        const testPopup = window.open('', '_blank', 'width=100,height=100');
        if (testPopup) {
          testPopup.close();
          console.log("Popups should work");
        }
      } catch (e) {
        console.warn("Popup test inconclusive");
      }

      // Sign in with popup
      const result = await signInWithPopup(auth, googleProvider);
      
      if (!result?.user) throw new Error("No user returned");
      
      await completeLogin(result.user, role);
      
    } catch (error) {
      console.error("Sign-in error:", error);
      
      if (error.code === 'auth/popup-blocked') {
        setErr("Popup blocked! Switching to redirect method...");
        setUseRedirect(true);
        // Retry with redirect
        setTimeout(() => handleSignIn(role), 1000);
      } else if (error.code === 'auth/network-request-failed') {
        setErr("Network error. Please check your connection.");
      } else if (error.code === 'auth/popup-closed-by-user') {
        setErr("Sign-in window was closed.");
      } else {
        setErr(error.message || "Sign-in failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
      <div className="max-w-md w-full p-8 bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 mb-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-cyan-400 mb-2">Wisdom Warfare</h1>
          <p className="text-gray-300">Interactive Gamified Learning Platform</p>
        </div>

        {err && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
            <p className="font-semibold">⚠️ {err}</p>
            {err.includes('popup') && !useRedirect && (
              <button
                onClick={() => setUseRedirect(true)}
                className="mt-2 text-sm text-cyan-300 hover:text-cyan-200 underline"
              >
                Click here to use redirect method instead
              </button>
            )}
          </div>
        )}

        {useRedirect && (
          <div className="mb-6 p-4 bg-amber-900/30 border border-amber-700 rounded-lg text-amber-200">
            <p className="font-semibold">📢 Using Redirect Method</p>
            <p className="text-sm mt-1">You'll be redirected to Google for sign-in.</p>
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={() => handleSignIn("student")}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white py-4 px-6 rounded-xl font-semibold text-lg transition-all"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                {useRedirect ? "Redirecting..." : "Signing in..."}
              </>
            ) : (
              <>
                <img src="/google-logo.svg" alt="Google" className="w-5 h-5" />
                Sign in as Student
              </>
            )}
          </button>

          <button
            onClick={() => handleSignIn("teacher")}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white py-4 px-6 rounded-xl font-semibold text-lg transition-all"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                {useRedirect ? "Redirecting..." : "Signing in..."}
              </>
            ) : (
              <>
                <img src="/google-logo.svg" alt="Google" className="w-5 h-5" />
                Sign in as Teacher
              </>
            )}
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-700 text-center">
          <p className="text-gray-400 mb-2">Having trouble signing in?</p>
          <button
            onClick={() => setUseRedirect(!useRedirect)}
            className="text-sm text-cyan-300 hover:text-cyan-200 underline"
          >
            Switch to {useRedirect ? "Popup" : "Redirect"} Method
          </button>
        </div>
      </div>

      {/* Debug Info */}
      <div className="max-w-md w-full p-6 bg-gray-900/50 rounded-xl border border-gray-700 text-sm">
        <h3 className="font-bold text-gray-300 mb-2">📋 Configuration Status:</h3>
        <div className="space-y-1 text-gray-400">
          <p>• Firebase Domain: <span className={firebaseConfig.authDomain.includes('firebaseapp.com') ? "text-green-400" : "text-red-400"}>
            {firebaseConfig.authDomain.includes('firebaseapp.com') ? "✓ Correct" : "✗ Wrong - fix this!"}
          </span></p>
          <p>• Current Method: <span className="text-cyan-300">{useRedirect ? "Redirect" : "Popup"}</span></p>
          <p>• API Base: <span className={API_BASE ? "text-green-400" : "text-red-400"}>
            {API_BASE ? API_BASE : "Not set"}
          </span></p>
          
          <button
            onClick={() => {
              console.log("Firebase Config:", firebaseConfig);
              console.log("Current auth:", auth);
              console.log("LocalStorage:", {
                user_id: localStorage.getItem('user_id'),
                user_role: localStorage.getItem('user_role'),
                user_email: localStorage.getItem('user_email')
              });
            }}
            className="mt-3 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs"
          >
            Show Debug Info
          </button>
        </div>
      </div>
    </div>
  );
}