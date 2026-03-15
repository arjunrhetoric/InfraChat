import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getRoleName } from "../utils/roles";

function SunIcon() {
  return (
    <svg
      className="theme-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5" />
      <path d="M12 19.5V22" />
      <path d="M4.93 4.93l1.77 1.77" />
      <path d="M17.3 17.3l1.77 1.77" />
      <path d="M2 12h2.5" />
      <path d="M19.5 12H22" />
      <path d="M4.93 19.07l1.77-1.77" />
      <path d="M17.3 6.7l1.77-1.77" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      className="theme-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

function Navbar() {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState(
    localStorage.getItem("theme") || "light"
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <nav className="navbar">
      <div className="nav-left">
        <Link to="/" className="brand">
          InfraChat
        </Link>
      </div>

      <div className="nav-right">
        <button
          className="btn secondary small theme-toggle"
          onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
          aria-label="Toggle theme"
          title="Toggle theme"
        >
          {theme === "light" ? <MoonIcon /> : <SunIcon />}
        </button>

        {user?.role >= 2 && (
          <Link to="/audit" className="btn secondary small">
            Audit Logs
          </Link>
        )}

        {user?.role === 3 && (
          <Link to="/admin" className="btn primary small">
            Admin Panel
          </Link>
        )}

        {user && (
          <span className="nav-user">
            {user.username} ({getRoleName(user.role)})
          </span>
        )}

        {user && (
          <button onClick={logout} className="btn danger small">
            Logout
          </button>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
