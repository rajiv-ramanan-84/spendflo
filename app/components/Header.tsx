'use client';

import { UserSelector } from './UserSelector';

export function Header() {
  return (
    <header className="bg-white border-b-2 border-gray-100 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-pink-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
              </svg>
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900">SpendFlo</div>
              <div className="text-xs text-gray-500">Budget Service</div>
            </div>
          </a>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <a href="/dashboard" className="text-sm font-medium text-gray-600 hover:text-pink-600 transition-colors">
              Dashboard
            </a>
            <a href="/business/request" className="text-sm font-medium text-gray-600 hover:text-pink-600 transition-colors">
              Request Budget
            </a>
            <a href="/business/requests" className="text-sm font-medium text-gray-600 hover:text-pink-600 transition-colors">
              My Requests
            </a>
            <a href="/fpa/upload" className="text-sm font-medium text-gray-600 hover:text-pink-600 transition-colors">
              Upload
            </a>
            <a href="/audit" className="text-sm font-medium text-gray-600 hover:text-pink-600 transition-colors">
              Audit Log
            </a>
          </nav>

          {/* User Selector */}
          <UserSelector />
        </div>
      </div>
    </header>
  );
}
