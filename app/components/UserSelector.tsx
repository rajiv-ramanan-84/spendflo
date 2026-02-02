'use client';

import { useEffect, useState } from 'react';

export function UserSelector() {
  const [user, setUser] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    // Load from localStorage
    const saved = localStorage.getItem('currentUser');
    if (saved) {
      setUser(saved);
    } else {
      setUser('FP&A User');
      localStorage.setItem('currentUser', 'FP&A User');
    }
  }, []);

  function handleUserChange(newUser: string) {
    setUser(newUser);
    localStorage.setItem('currentUser', newUser);
    setShowDropdown(false);
    window.dispatchEvent(new Event('userChanged'));
  }

  const users = [
    'FP&A User',
    'Business User',
    'Finance Manager',
    'Department Head',
    'Admin',
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center space-x-2 px-4 py-2 bg-white border-2 border-gray-200 rounded-lg hover:border-pink-500 transition-colors"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <span className="text-sm font-medium text-gray-900">{user}</span>
        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showDropdown && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-white border-2 border-gray-200 rounded-xl shadow-lg z-50">
          {users.map((u) => (
            <button
              key={u}
              onClick={() => handleUserChange(u)}
              className={`w-full px-4 py-3 text-left text-sm hover:bg-pink-50 transition-colors first:rounded-t-xl last:rounded-b-xl ${
                u === user ? 'bg-pink-50 font-semibold text-pink-600' : 'text-gray-900'
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper function to get current user
export function getCurrentUser(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('currentUser') || 'FP&A User';
  }
  return 'FP&A User';
}
