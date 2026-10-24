import express from 'express';
import {
  getPublicAssets,
  getAdminAssets,
  createAsset,
  updateAsset,
  deleteAsset,
} from '../controllers/asset.controller.js';
import { protect, adminOnly } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Public routes for trading portal & apk
router.get('/', getPublicAssets);

// Admin-only asset management routes
router.get('/admin/all', protect, adminOnly, getAdminAssets);
router.post('/admin/create', protect, adminOnly, createAsset);
router.put('/admin/:id', protect, adminOnly, updateAsset);
router.delete('/admin/:id', protect, adminOnly, deleteAsset);

// Standard REST aliases
router.post('/', protect, adminOnly, createAsset);
router.put('/:id', protect, adminOnly, updateAsset);
router.delete('/:id', protect, adminOnly, deleteAsset);

export default router;
