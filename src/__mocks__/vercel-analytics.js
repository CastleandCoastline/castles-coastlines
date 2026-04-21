// Mock for @vercel/analytics/react in tests
module.exports = {
  Analytics: () => null,
  track: jest.fn(),
};
