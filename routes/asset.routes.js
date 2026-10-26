import express from 'express';
import {
  getPublicAssets,
  getAdminAssets,
  createAsset,
  updateAsset,
  deleteAsset,
  toggleAssetStatus,
} from '../controllers/asset.controller.js';
import { protect, adminOnly } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Public routes for trading portal & apk (returns live assets with isEnabled flag)
router.get('/', getPublicAssets);

// Explicit toggle status routes (body payload: { id, symbol, _id, isEnabled })
router.put('/admin/toggle-status', protect, adminOnly, toggleAssetStatus);
router.post('/admin/toggle-status', protect, adminOnly, toggleAssetStatus);
router.put('/toggle-status', protect, adminOnly, toggleAssetStatus);
router.post('/toggle-status', protect, adminOnly, toggleAssetStatus);

// Body-based asset update route
router.put('/admin/update', protect, adminOnly, updateAsset);
router.put('/update', protect, adminOnly, updateAsset);

// Admin-only asset management routes
router.get('/admin/all', protect, adminOnly, getAdminAssets);
router.post('/admin/create', protect, adminOnly, createAsset);
router.put('/admin/:id(*)', protect, adminOnly, updateAsset);
router.delete('/admin/:id(*)', protect, adminOnly, deleteAsset);

// Standard REST aliases
router.post('/', protect, adminOnly, createAsset);
router.put('/:id(*)', protect, adminOnly, updateAsset);
router.delete('/:id(*)', protect, adminOnly, deleteAsset);

export default router;

