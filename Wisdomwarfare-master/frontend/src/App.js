import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  useParams,
} from "react-router-dom";
import WelcomePage from "./WelcomePage";
import GamePage from "./GamePage";
import TeacherGameManagementPage from "./TeacherGameManagementPage";
import GameUI from "./components/GameUI/GameUI";
import StudentDashboard from "./components/StudentDashboard/StudentDashboard";
import "./App.css";

function HomeLanding({ user, role, onLogout }) {
  const navigate = useNavigate();

  const getDisplayName = (u) => {
    if (!u) return "User";
    return u.display_name || u.displayName || u.username || u.email || "User";
  };

  if (!user || !role) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <h1 className="text-3xl mb-2">Welcome, {getDisplayName(user)}!</h1>
      <p className="mb-6">{user?.email || ""}</p>
      <div className="flex gap-4">
        <button
          onClick={() => {
            if (role === "teacher") navigate("/teacher-game-management");
            else navigate("/gamepage");
          }}
          className={`px-6 py-3 rounded-lg ${
            role === "teacher"
              ? "bg-rose-600 hover:bg-rose-500"
              : "bg-cyan-600 hover:bg-cyan-500"
          }`}
        >
          Continue
        </button>
        <button
          onClick={() => {
            onLogout();
            navigate("/", { replace: true });
          }}
          className="px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600"
        >
          Logout
        </button>
      </div>
    </div>
  );
}

/**
 * Wrapper route for GameUI that:
 * - reads gameCode from :gameCode URL param (for email links /play/ABC123)
 * - or from location.state (when navigating from GamePage)
 * - or from localStorage (fallback)
 */
function GameUIRoute({ user, onLogout, onFinish }) {
  const { gameCode: codeParam } = useParams();
  const location = useLocation();

  const [gameCode, setGameCode] = useState(
    codeParam ||
      (location.state && location.state.gameCode) ||
      localStorage.getItem("WW_GAME_CODE") ||
      ""
  );

  useEffect(() => {
    const code =
      codeParam || (location.state && location.state.gameCode) || "";
    if (code) {
      setGameCode(code);
      localStorage.setItem("WW_GAME_CODE", code);
    }
  }, [codeParam, location.state]);

  return (
    <GameUI
      user={user}
      onLogout={onLogout}
      onFinish={onFinish}
      gameCode={gameCode}
    />
  );
}

// Add this new component at the top of AppRouterContainer function
function FirebaseAuthRedirectHandler() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    console.log("Firebase auth handler triggered at:", location.pathname);
    console.log("Full URL:", window.location.href);
    
    // Firebase OAuth redirects here, but we need to redirect to home
    // Check if user is already logged in via localStorage
    const uid = localStorage.getItem("user_id");
    const savedRole = localStorage.getItem("user_role");
    
    if (uid && savedRole) {
      console.log("User already logged in, redirecting to /home");
      navigate("/home", { replace: true });
    } else {
      console.log("No user found, redirecting to /");
      navigate("/", { replace: true });
    }
  }, [navigate, location]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto"></div>
        <p className="mt-4 text-white">Completing authentication...</p>
      </div>
    </div>
  );
}

function AppRouterContainer() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const uid = localStorage.getItem("user_id");
    const email = localStorage.getItem("user_email");
    const savedRole = localStorage.getItem("user_role");

    if (uid && savedRole) {
      setUser({ user_id: uid, email });
      setRole(savedRole);
    }
  }, []);useEffect(() => {
  // Import Firebase auth dynamically to avoid issues
  import("./firebaseConfig").then(({ auth }) => {
    const { onAuthStateChanged } = require("firebase/auth");
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("Firebase auth state changed:", firebaseUser);

      if (firebaseUser) {
        // If we already have app state, nothing to do
        if (user) return;

        // Determine role: prefer sessionStorage (set before redirect), fallback to localStorage
        const roleFromSession = sessionStorage.getItem("signInRole") || localStorage.getItem("user_role") || "student";

        // Call backend to upsert user and get app user_id
        try {
          const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4001";
          const payload = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            display_name: firebaseUser.displayName || firebaseUser.email,
            role: roleFromSession,
          };

          const res = await fetch(`${API_BASE}/auth/upsert-user`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            const data = await res.json();
            const userObj = {
              user_id: data.user_id,
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              display_name: firebaseUser.displayName || firebaseUser.email,
            };

            localStorage.setItem("user_id", data.user_id);
            localStorage.setItem("user_email", firebaseUser.email);
            localStorage.setItem("user_role", roleFromSession);
            sessionStorage.removeItem("signInRole");

            setUser(userObj);
            setRole(roleFromSession);

            // Navigate to home after successful sign-in
            navigate("/home", { replace: true });
          } else {
            console.error("Backend upsert failed", res.status, await res.text());
          }
        } catch (err) {
          console.error("Error calling backend upsert on auth state change:", err);
        }
      } else {
        console.log("Firebase user is null (signed out)");
      }
    });
    
    return () => unsubscribe();
  });
}, [user]); // Only re-run when user changes

  const handleLogout = () => {
    setUser(null);
    setRole(null);
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_role");
    localStorage.removeItem("WW_GAME_CODE");
    navigate("/", { replace: true });
  };

  const handleLogin = (userObj, roleStr) => {
    setUser(userObj);
    setRole(roleStr);
    if (userObj.user_id) {
      localStorage.setItem("user_id", userObj.user_id);
      localStorage.setItem("user_email", userObj.email);
      localStorage.setItem("user_role", roleStr);
    }
    navigate("/home", { replace: true });
  };

  return (
  
  <Routes>
  {/* Welcome / Login */}
  <Route path="/" element={<WelcomePage />} />

  {/* Student game landing */}
  <Route
    path="/gamepage"
    element={
      user ? (
        <GamePage
          user={user}
          onStartGame={(code) => {
            if (code) {
              navigate(`/play/${encodeURIComponent(code)}`);
            } else {
              navigate("/play");
            }
          }}
          onLogout={handleLogout}
        />
      ) : (
        <Navigate to="/" replace />
      )
    }
  />

  {/* Play game (no param) */}
  <Route
    path="/play"
    element={
      user ? (
        <GameUIRoute
          user={user}
          onLogout={handleLogout}
          onFinish={() => navigate("/gamepage", { replace: true })}
        />
      ) : (
        <Navigate to="/" replace />
      )
    }
  />

  {/* Play game (with code) */}
  <Route
    path="/play/:gameCode"
    element={
      user ? (
        <GameUIRoute
          user={user}
          onLogout={handleLogout}
          onFinish={() => navigate("/gamepage", { replace: true })}
        />
      ) : (
        <Navigate to="/" replace />
      )
    }
  />

  {/* Teacher dashboard */}
  <Route
  path="/teacher-game-management"
  element={
    user && role === "teacher" ? (
      <TeacherGameManagementPage />
    ) : (
      <Navigate to="/" replace />
    )
  }
/>


  {/* Optional dashboard */}
  <Route
    path="/dashboard"
    element={user ? <StudentDashboard /> : <Navigate to="/" replace />}
  />

  {/* 404 */}
  <Route
    path="*"
    element={
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
        <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
        <a href="/" className="text-cyan-400 underline">
          Go back to Welcome
        </a>
      </div>
    }
  />
</Routes>

  );
}

function App() {
  return (
    <Router>
      <AppRouterContainer />
    </Router>
  );
}

export default App;