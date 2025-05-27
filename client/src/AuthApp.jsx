import React, { useState, useEffect } from "react";
import { User, Mail, Lock, LogOut, UserPlus, Crown } from "lucide-react";
import "./AuthApp.css";

const AuthApp = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login"); // 'login', 'register', 'profile'
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Configure API base URL - Update this to match your backend
  const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

  // Check if user is authenticated on component mount
  useEffect(() => {
    checkAuthStatus();
  }, [API_BASE_URL]);

  const apiCall = async (endpoint, options = {}) => {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      ...options,
    };

    if (options.body && typeof options.body === "object") {
      config.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, config);

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Request failed" }));
      throw new Error(
        errorData.message || `HTTP error! status: ${response.status}`
      );
    }

    return response.json();
  };

  const checkAuthStatus = async () => {
    try {
      const userData = await apiCall("/auth/me");
      setCurrentUser(userData);
      setAuthMode("profile");
    } catch (error) {
      setCurrentUser(null);
      setAuthMode("login");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError("");
    setSuccess("");
  };

  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE_URL}/auth/google`;
  };

  const handleManualLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await apiCall("/auth/login", {
        method: "POST",
        body: {
          email: formData.email,
          password: formData.password,
        },
      });

      if (response.user) {
        setCurrentUser(response.user);
        setAuthMode("profile");
        setSuccess("Login successful!");
      }
    } catch (error) {
      setError(error.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualRegister = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const response = await apiCall("/auth/register", {
        method: "POST",
        body: {
          email: formData.email,
          password: formData.password,
          name: formData.name,
        },
      });

      if (response.user) {
        setCurrentUser(response.user);
        setAuthMode("profile");
        setSuccess("Registration successful!");
      }
    } catch (error) {
      setError(error.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiCall("/auth/logout", { method: "POST" });
      setCurrentUser(null);
      setAuthMode("login");
      setFormData({ email: "", password: "", name: "", confirmPassword: "" });
      setSuccess("Logged out successfully!");
    } catch (error) {
      setError("Logout failed");
    }
  };

  const resetForm = () => {
    setFormData({ email: "", password: "", name: "", confirmPassword: "" });
    setError("");
    setSuccess("");
  };

  if (loading && !currentUser) {
    return (
      <div className="loading-screen">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="main-container">
      <div className="content-wrapper">
        {/* Header */}
        <div className="header">
          <div className="header-icon">
            <Crown className="header-icon-svg" />
          </div>
          <h1 className="header-title">Chess Master</h1>
          <p className="header-subtitle">Your gateway to strategic battles</p>
        </div>

        {/* Alert Messages */}
        {error && <div className="alert-error">{error}</div>}

        {success && <div className="alert-success">{success}</div>}

        {/* Main Card */}
        <div className="main-card">
          {authMode === "profile" && currentUser ? (
            // Profile View
            <div className="profile-content">
              <div className="text-center mb-6">
                <div className="profile-avatar">
                  {currentUser.avatar_url ? (
                    <img
                      src={currentUser.avatar_url}
                      alt="Profile"
                      className="profile-avatar-img"
                    />
                  ) : (
                    <User className="profile-avatar-icon" />
                  )}
                </div>
                <h2 className="profile-title">Welcome back!</h2>
                <p className="profile-subtitle">{currentUser.name}</p>
              </div>

              <div className="profile-info">
                <div className="profile-info-item">
                  <p className="profile-info-label">Name</p>
                  <p className="profile-info-value">{currentUser.name}</p>
                </div>

                <div className="profile-info-item">
                  <p className="profile-info-label">Email</p>
                  <p className="profile-info-value">{currentUser.email}</p>
                </div>

                {currentUser.google_id && (
                  <div className="profile-info-item">
                    <p className="profile-info-label">Account Type</p>
                    <p className="profile-info-value">Google Account</p>
                  </div>
                )}
              </div>

              <div className="profile-buttons">
                <button
                  onClick={() => alert("Chess game will be loaded here!")}
                  className="btn-primary"
                >
                  Start Playing Chess
                </button>

                <button onClick={handleLogout} className="btn-secondary">
                  <LogOut className="btn-icon" />
                  Logout
                </button>
              </div>
            </div>
          ) : (
            // Auth Forms
            <div>
              {/* Tab Navigation */}
              <div className="auth-tabs">
                <button
                  onClick={() => {
                    setAuthMode("login");
                    resetForm();
                  }}
                  className={`auth-tab ${authMode === "login" ? "active" : ""}`}
                >
                  Login
                </button>
                <button
                  onClick={() => {
                    setAuthMode("register");
                    resetForm();
                  }}
                  className={`auth-tab ${
                    authMode === "register" ? "active" : ""
                  }`}
                >
                  Register
                </button>
              </div>

              <div className="auth-content">
                {/* Google Login Button */}
                <button onClick={handleGoogleLogin} className="btn-google">
                  <svg className="google-icon" viewBox="0 0 24 24">
                    <path
                      fill="#4285f4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34a853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#fbbc05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#ea4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </button>

                <div className="divider">
                  <div className="divider-text">or continue with email</div>
                </div>

                {/* Manual Auth Form */}
                <div className="space-y-4">
                  {authMode === "register" && (
                    <div className="form-group">
                      <User className="form-icon" />
                      <input
                        type="text"
                        name="name"
                        placeholder="Full Name"
                        value={formData.name}
                        onChange={handleInputChange}
                        required
                        className="form-input"
                      />
                    </div>
                  )}

                  <div className="form-group">
                    <Mail className="form-icon" />
                    <input
                      type="email"
                      name="email"
                      placeholder="Email Address"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <Lock className="form-icon" />
                    <input
                      type="password"
                      name="password"
                      placeholder="Password"
                      value={formData.password}
                      onChange={handleInputChange}
                      required
                      className="form-input"
                    />
                  </div>

                  {authMode === "register" && (
                    <div className="form-group">
                      <Lock className="form-icon" />
                      <input
                        type="password"
                        name="confirmPassword"
                        placeholder="Confirm Password"
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                        required
                        className="form-input"
                      />
                    </div>
                  )}

                  <button
                    onClick={
                      authMode === "login"
                        ? handleManualLogin
                        : handleManualRegister
                    }
                    disabled={loading}
                    className="btn-submit"
                  >
                    {loading ? (
                      <>
                        <div className="spinner"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        {authMode === "register" && (
                          <UserPlus className="btn-icon" />
                        )}
                        {authMode === "login" ? "Sign In" : "Create Account"}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="footer">
          <p className="footer-text">Ready to master the game of kings?</p>
        </div>
      </div>
    </div>
  );
};

export default AuthApp;
