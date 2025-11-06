import { useState } from "react";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";

export default function ResetPassword() {
  const [email, setEmail] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  const handleReset = async () => {
    const auth = getAuth();
    setMessage("");
    setError("");

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage("Password reset email sent! Check your inbox.");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "auto", textAlign: "center" }}>
      <h2>Reset Password</h2>
      <input
        type="email"
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{
          width: "100%",
          padding: "8px",
          marginBottom: "10px",
          borderRadius: "4px",
          border: "1px solid #ccc",
        }}
      />
      <button
        onClick={handleReset}
        style={{
          width: "100%",
          padding: "8px",
          backgroundColor: "#1976d2",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        Send Reset Email
      </button>
      {message && <p style={{ color: "green" }}>{message}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
