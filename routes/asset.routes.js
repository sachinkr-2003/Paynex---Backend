import express from 'express';
import {
  getPublicAssets,
  getAdminAssets,
  createAsset,
  updateAsset,
  deleteAsset,
  toggleAssetStatus,
  enableAllAssets,
  updateGroupQr,
  updateGroupInterestRate,
} from '../controllers/asset.controller.js';
import { protect, adminOnly } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Public routes for trading portal & apk (returns live assets with isEnabled flag)
router.get('/', getPublicAssets);

// Bulk Enable All Assets (1-Click Activate All 50+ Stocks)
router.put('/admin/enable-all', protect, adminOnly, enableAllAssets);
router.post('/admin/enable-all', protect, adminOnly, enableAllAssets);
router.put('/enable-all', protect, adminOnly, enableAllAssets);
router.post('/enable-all', protect, adminOnly, enableAllAssets);

// Bulk Group QR update route (Groups 1 to 5)
router.put('/admin/bulk-group-qr', protect, adminOnly, updateGroupQr);
router.post('/admin/bulk-group-qr', protect, adminOnly, updateGroupQr);
router.put('/bulk-group-qr', protect, adminOnly, updateGroupQr);
router.post('/bulk-group-qr', protect, adminOnly, updateGroupQr);

// Bulk Group Interest Rate update route (Groups 1 to 5)
router.put('/admin/bulk-group-interest', protect, adminOnly, updateGroupInterestRate);
router.post('/admin/bulk-group-interest', protect, adminOnly, updateGroupInterestRate);
router.put('/bulk-group-interest', protect, adminOnly, updateGroupInterestRate);
router.post('/bulk-group-interest', protect, adminOnly, updateGroupInterestRate);

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
router.put('/admin/:id', protect, adminOnly, updateAsset);
router.delete('/admin/:id', protect, adminOnly, deleteAsset);

// Standard REST aliases
router.post('/', protect, adminOnly, createAsset);
router.put('/:id', protect, adminOnly, updateAsset);
router.delete('/:id', protect, adminOnly, deleteAsset);

export default router;

