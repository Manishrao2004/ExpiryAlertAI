/**
 * auth.js — JWT token helpers for frontend
 */

const TOKEN_KEY = 'ea_jwt_token';
const USER_KEY = 'ea_user';

export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const removeToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export const setUser = (user) => localStorage.setItem(USER_KEY, JSON.stringify(user));
export const getUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
};

/**
 * Decode a JWT payload without verifying signature.
 * Used only for reading exp/name — server always re-validates.
 */
function decodeToken(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

/**
 * Returns true if token exists and is not expired.
 */
export function isTokenValid() {
  const token = getToken();
  if (!token) return false;
  const payload = decodeToken(token);
  if (!payload || !payload.exp) return false;
  // exp is in seconds, Date.now() is in ms
  return payload.exp * 1000 > Date.now();
}
