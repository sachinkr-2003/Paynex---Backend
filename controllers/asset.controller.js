import Asset from '../models/asset.model.js';

// @desc    Get all enabled stocks / crypto assets for trading portal
// @route   GET /api/assets
export const getPublicAssets = async (req, res) => {
  try {
    const assets = await Asset.find({ isEnabled: true }).sort({ createdAt: 1 });
    return res.status(200).json({
      success: true,
      count: assets.length,
      assets,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all assets for Admin Panel (including inactive)
// @route   GET /api/admin/assets
export const getAdminAssets = async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = {};

    if (category && category !== 'All') {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { symbol: { $regex: search, $options: 'i' } },
        { id: { $regex: search, $options: 'i' } },
      ];
    }

    const assets = await Asset.find(query).sort({ createdAt: -1 });

    const totalCount = await Asset.countDocuments();
    const activeCount = await Asset.countDocuments({ isEnabled: true });
    const stockCount = await Asset.countDocuments({ category: 'Stock' });
    const cryptoCount = await Asset.countDocuments({ category: 'Crypto' });

    return res.status(200).json({
      success: true,
      stats: { totalCount, activeCount, stockCount, cryptoCount },
      assets,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create new stock / crypto game asset
// @route   POST /api/admin/assets
export const createAsset = async (req, res) => {
  try {
    const {
      name,
      symbol,
      category,
      basePrice,
      step,
      icon,
      color,
      returnPercent,
      minStake,
      maxStake,
      isEnabled,
      description,
    } = req.body;

    if (!name || !symbol || !basePrice) {
      return res.status(400).json({
        success: false,
        message: 'Name, Symbol, and Base Price are required.',
      });
    }

    const cleanSymbol = symbol.trim().toUpperCase();
    const assetId = cleanSymbol.includes('/') ? cleanSymbol : `${cleanSymbol}/INR`;

    const existing = await Asset.findOne({ $or: [{ id: assetId }, { symbol: cleanSymbol }] });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `An asset with symbol "${cleanSymbol}" already exists.`,
      });
    }

    const newAsset = await Asset.create({
      id: assetId,
      name: name.trim(),
      symbol: cleanSymbol,
      category: category || (cleanSymbol.includes('/') ? 'Crypto' : 'Stock'),
      basePrice: Number(basePrice),
      step: Number(step) || Math.max(1, Number(basePrice) * 0.005),
      icon: icon || (category === 'Stock' ? '🏢' : '₿'),
      color: color || '#f59e0b',
      returnPercent: Number(returnPercent) || 30, // Custom interest % set by admin
      minStake: Number(minStake) || 100,
      maxStake: Number(maxStake) || 500000,
      isEnabled: isEnabled !== undefined ? isEnabled : true,
      upiId: (req.body.upiId || '').trim(),
      qrCode: req.body.qrCode || '',
      payeeName: (req.body.payeeName || '').trim(),
      description: description || '',
    });

    return res.status(201).json({
      success: true,
      message: `Asset "${newAsset.name}" (+${newAsset.returnPercent}% interest) created successfully.`,
      asset: newAsset,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update stock / crypto interest rate or details
// @route   PUT /api/admin/assets/:id
export const updateAsset = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const asset = await Asset.findOne({
      $or: [{ id }, { symbol: id.toUpperCase() }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!asset) {
      return res.status(404).json({ success: false, message: 'Asset not found.' });
    }

    if (updates.name !== undefined) asset.name = updates.name.trim();
    if (updates.category !== undefined) asset.category = updates.category;
    if (updates.basePrice !== undefined) asset.basePrice = Number(updates.basePrice);
    if (updates.step !== undefined) asset.step = Number(updates.step);
    if (updates.icon !== undefined) asset.icon = updates.icon;
    if (updates.color !== undefined) asset.color = updates.color;
    if (updates.returnPercent !== undefined) asset.returnPercent = Number(updates.returnPercent);
    if (updates.minStake !== undefined) asset.minStake = Number(updates.minStake);
    if (updates.maxStake !== undefined) asset.maxStake = Number(updates.maxStake);
    if (updates.isEnabled !== undefined) asset.isEnabled = Boolean(updates.isEnabled);
    if (updates.upiId !== undefined) asset.upiId = updates.upiId.trim();
    if (updates.qrCode !== undefined) asset.qrCode = updates.qrCode;
    if (updates.payeeName !== undefined) asset.payeeName = updates.payeeName.trim();
    if (updates.description !== undefined) asset.description = updates.description;

    await asset.save();

    return res.status(200).json({
      success: true,
      message: `Asset "${asset.name}" updated successfully (+${asset.returnPercent}% return).`,
      asset,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete / deactivate an asset
// @route   DELETE /api/admin/assets/:id
export const deleteAsset = async (req, res) => {
  try {
    const { id } = req.params;

    const asset = await Asset.findOneAndDelete({
      $or: [{ id }, { symbol: id.toUpperCase() }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!asset) {
      return res.status(404).json({ success: false, message: 'Asset not found.' });
    }

    return res.status(200).json({
      success: true,
      message: `Asset "${asset.name}" has been removed from trading engine.`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
