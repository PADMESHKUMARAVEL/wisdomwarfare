// // src/utils/helpers.js

// // Format accuracy to 1 decimal place
// export const formatAccuracy = (accuracy) => {
//   if (accuracy === null || accuracy === undefined) return '0.0';
//   const numAccuracy = typeof accuracy === 'number' ? accuracy : parseFloat(accuracy || 0);
//   return isNaN(numAccuracy) ? '0.0' : numAccuracy.toFixed(1);
// };

// // Format score with commas
// export const formatScore = (score) => {
//   if (score === null || score === undefined) return '0';
//   const numScore = typeof score === 'number' ? score : parseInt(score || 0);
//   return isNaN(numScore) ? '0' : numScore.toLocaleString();
// };

// // Format percentage
// export const formatPercentage = (value, total) => {
//   if (!total || total === 0) return '0.0%';
//   const percentage = (value / total) * 100;
//   return formatAccuracy(percentage) + '%';
// };



// Format accuracy to 2 decimal places
export const formatAccuracy = (accuracy) => {
  if (accuracy === null || accuracy === undefined) return "0.00";
  return parseFloat(accuracy).toFixed(2);
};

// Format score with commas
export const formatScore = (score) => {
  if (score === null || score === undefined) return "0";
  return parseInt(score).toLocaleString();
};

// Format percentage
export const formatPercentage = (value) => {
  if (value === null || value === undefined) return "0%";
  return `${parseFloat(value).toFixed(1)}%`;
};

// Capitalize first letter
export const capitalize = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

// Format time in seconds to MM:SS
export const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

// Validate email
export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

// Debounce function
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Get difficulty color
export const getDifficultyColor = (difficulty) => {
  switch (difficulty?.toLowerCase()) {
    case 'easy': return 'green';
    case 'medium': return 'orange';
    case 'hard': return 'red';
    default: return 'gray';
  }
};

// Calculate rank suffix
export const getRankSuffix = (rank) => {
  if (rank === 1) return 'st';
  if (rank === 2) return 'nd';
  if (rank === 3) return 'rd';
  return 'th';
};

export default {
  formatAccuracy,
  formatScore,
  formatPercentage,
  capitalize,
  formatTime,
  validateEmail,
  debounce,
  getDifficultyColor,
  getRankSuffix
};