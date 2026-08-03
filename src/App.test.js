jest.mock('@microlink/react', () => {
  const React = require('react');
  return function MicrolinkMock() {
    return React.createElement('div', { 'data-testid': 'microlink-card' });
  };
});

jest.mock('firebase/app', () => ({
  initializeApp: () => ({}),
}));

jest.mock('firebase/firestore', () => ({
  collection: () => ({}),
  addDoc: () => Promise.resolve(),
  getDocs: () => Promise.resolve({ docs: [] }),
  deleteDoc: () => Promise.resolve(),
  query: () => ({}),
  where: () => ({}),
  onSnapshot: (queryRef, callback) => {
    callback({ docs: [] });
    return () => {};
  },
  getFirestore: () => ({}),
}));

jest.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  GoogleAuthProvider: function GoogleAuthProvider() {},
  signInWithPopup: () => Promise.resolve({ user: null }),
  onAuthStateChanged: (auth, callback) => {
    callback(null);
    return () => {};
  },
  signOut: () => Promise.resolve(),
}));

jest.mock('firebase/storage', () => ({
  getStorage: () => ({}),
  ref: () => ({}),
  uploadBytes: () => Promise.resolve(),
  getDownloadURL: () => Promise.resolve(''),
}));

import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the current URL card interface', () => {
  render(<App />);
  expect(screen.getByPlaceholderText(/輸入網址/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /首頁/ })).toBeInTheDocument();
});
