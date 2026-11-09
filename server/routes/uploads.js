// server/routes/uploads.js
// ------------------------------------------------------------
// POST /api/uploads/sign
// Returns a short-lived Cloudinary *signed-upload* payload so the
// browser can upload the avatar directly to Cloudinary without the
// API secret ever leaving the server.
//
// SETUP
//   1. Add to server/index.js, next to the other routers:
//        import uploadsRouter from './routes/uploads.js';
//        app.use('/api/uploads', uploadsRouter);
//   2. Add to .env (Render -> Environment):
//        CLOUDINARY_CLOUD_NAME=your-cloud-name
//        CLOUDINARY_API_KEY=123456789012345
//        CLOUDINARY_API_SECRET=your-api-secret
//
// No Cloudinary SDK needed — the signature is just a SHA-1 of the
// sorted params + API secret, per Cloudinary's docs.
//
// NOTE: only `timestamp` is signed — no folder/public_id — so uploads
// land in the root of the cloud. Keep the params sent by the browser
// EXACTLY the ones signed here, or Cloudinary answers "Invalid Signature".
// ------------------------------------------------------------

import crypto from 'crypto';
import express from 'express';

import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

router.post('/sign', requireAuth, (req, res) => {
  try {
    if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
      return res
        .status(500)
        .json({ message: 'Cloudinary is not configured on the server.' });
    }

    // Only these params are signed; the browser must send them unchanged.
    const timestamp = Math.round(Date.now() / 1000);
    const params = { timestamp };

    // Cloudinary signature = sha1("k1=v1&k2=v2" + API_SECRET), keys sorted.
    // With no folder/public_id this is just sha1(`timestamp=${n}` + secret).
    const toSign = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');
    const signature = crypto
      .createHash('sha1')
      .update(toSign + API_SECRET)
      .digest('hex');

    return res.json({
      cloudName: CLOUD_NAME,
      apiKey: API_KEY,
      timestamp,
      signature,
    });
  } catch (error) {
    console.error('Sign route error:', error);
    return res.status(500).json({ message: 'Could not sign the upload.' });
  }
});

export default router;
