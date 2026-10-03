/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // The dev status badge sits in a corner, and on the session screen every
  // corner is a control (back, Finish, the keyboard bar, END HERE). It
  // intercepted taps in dev and made those specs flaky. Build errors still
  // surface through the overlay with it off.
  devIndicators: false,
}

export default nextConfig
