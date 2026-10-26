import Asset from '../models/asset.model.js';

// @desc    Get all stocks / crypto assets for trading portal & user apk (with live isEnabled flag)
// @route   GET /api/assets
export const getPublicAssets = async (req, res) => {
  try {
    const assets = await Asset.find({}).sort({ createdAt: 1 });
    const activeAssets = assets.filter((a) => a.isEnabled !== false);
    return res.status(200).json({
      success: true,
      count: assets.length,
      activeCount: activeAssets.length,
      assets,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Toggle stock / asset active status (Enabled vs Disabled)
// @route   PUT /api/assets/admin/toggle-status
export const toggleAssetStatus = async (req, res) => {
  try {
    const { id, symbol, _id, isEnabled } = req.body;

    const queryConditions = [];
    if (_id && /^[0-9a-fA-F]{24}$/.test(_id)) {
      queryConditions.push({ _id });
    }
    if (id) {
      queryConditions.push({ id });
      queryConditions.push({ symbol: id.toUpperCase() });
    }
    if (symbol) {
      queryConditions.push({ symbol: symbol.toUpperCase() });
      queryConditions.push({ id: symbol });
    }

    if (queryConditions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Asset identifier (id, symbol, or _id) is required.',
      });
    }

    let asset = await Asset.findOne({ $or: queryConditions });

    if (!asset) {
      return res.status(404).json({ success: false, message: 'Stock asset not found.' });
    }

    asset.isEnabled = Boolean(isEnabled);
    await asset.save();

    return res.status(200).json({
      success: true,
      message: `Stock "${asset.name}" (${asset.symbol}) is now ${asset.isEnabled ? 'ACTIVE / ENABLED' : 'DISABLED'}.`,
      asset,
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

// @desc    Create new stock / game asset
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
      upiId,
      qrCode,
      payeeName,
      description,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Stock name is required.',
      });
    }

    const cleanName = name.trim();
    // Auto-generate clean symbol if not provided
    let cleanSymbol = symbol && symbol.trim()
      ? symbol.trim().toUpperCase()
      : cleanName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase() || 'STOCK';
    
    let assetId = cleanSymbol.includes('/') ? cleanSymbol : `${cleanSymbol}/INR`;

    // If duplicate symbol exists, append a random number suffix to avoid conflict
    const existing = await Asset.findOne({ $or: [{ id: assetId }, { symbol: cleanSymbol }] });
    if (existing) {
      const suffix = Math.floor(100 + Math.random() * 900);
      cleanSymbol = `${cleanSymbol}${suffix}`;
      assetId = `${cleanSymbol}/INR`;
    }

    const targetReturn = Math.min(12, Math.max(2, Number(returnPercent) || 5));
    const targetMinStake = Math.max(100, Number(minStake) || 100);
    const targetBasePrice = Number(basePrice) || targetMinStake || 1000;

    const newAsset = await Asset.create({
      id: assetId,
      name: cleanName,
      symbol: cleanSymbol,
      category: category || 'Stock',
      basePrice: targetBasePrice,
      step: Number(step) || Math.max(1, targetBasePrice * 0.005),
      icon: icon || '📈',
      color: color || '#f59e0b',
      returnPercent: targetReturn, // strictly 2% - 12%
      minStake: targetMinStake,
      maxStake: Number(maxStake) || 500000,
      isEnabled: isEnabled !== undefined ? Boolean(isEnabled) : true,
      upiId: (upiId || '').trim(),
      qrCode: qrCode || '',
      payeeName: (payeeName || `${cleanName} Desk`).trim(),
      description: description || '',
    });

    return res.status(201).json({
      success: true,
      message: `Stock "${newAsset.name}" (+${newAsset.returnPercent}% interest, Min ₹${newAsset.minStake}) created successfully.`,
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
    const rawId = req.params.id || req.body.id || req.body._id || req.body.symbol;
    const updates = req.body;

    if (!rawId) {
      return res.status(400).json({ success: false, message: 'Stock identifier is required.' });
    }

    const decodedId = decodeURIComponent(rawId);
    const queryConditions = [
      { id: decodedId },
      { id: rawId },
      { symbol: decodedId.toUpperCase() },
      { symbol: rawId.toUpperCase() },
    ];

    if (/^[0-9a-fA-F]{24}$/.test(rawId)) {
      queryConditions.push({ _id: rawId });
    }
    if (updates._id && /^[0-9a-fA-F]{24}$/.test(updates._id)) {
      queryConditions.push({ _id: updates._id });
    }
    if (updates.id) {
      queryConditions.push({ id: updates.id });
    }
    if (updates.symbol) {
      queryConditions.push({ symbol: updates.symbol.toUpperCase() });
    }

    let asset = await Asset.findOne({ $or: queryConditions });

    if (!asset) {
      // Auto-upsert asset so company QR updates are never lost even if newly referenced
      asset = new Asset({
        id: updates.id || decodedId,
        name: updates.name || decodedId,
        symbol: (updates.symbol || decodedId).toUpperCase(),
        basePrice: Number(updates.basePrice) || 1000,
        returnPercent: Math.min(12, Math.max(2, Number(updates.returnPercent) || 5)),
        minStake: Math.max(100, Number(updates.minStake) || 100),
        category: updates.category || 'Stock',
      });
    }

    if (updates.name !== undefined) asset.name = updates.name.trim();
    if (updates.category !== undefined) asset.category = updates.category;
    if (updates.basePrice !== undefined) asset.basePrice = Number(updates.basePrice);
    if (updates.step !== undefined) asset.step = Number(updates.step);
    if (updates.icon !== undefined) asset.icon = updates.icon;
    if (updates.color !== undefined) asset.color = updates.color;
    if (updates.returnPercent !== undefined) {
      asset.returnPercent = Math.min(12, Math.max(2, Number(updates.returnPercent)));
    }
    if (updates.minStake !== undefined) {
      asset.minStake = Math.max(100, Number(updates.minStake));
    }
    if (updates.maxStake !== undefined) asset.maxStake = Number(updates.maxStake);
    if (updates.isEnabled !== undefined) asset.isEnabled = Boolean(updates.isEnabled);
    if (updates.upiId !== undefined) asset.upiId = updates.upiId.trim();
    if (updates.qrCode !== undefined) asset.qrCode = updates.qrCode;
    if (updates.payeeName !== undefined) asset.payeeName = updates.payeeName.trim();
    if (updates.description !== undefined) asset.description = updates.description;

    await asset.save();

    return res.status(200).json({
      success: true,
      message: `Stock "${asset.name}" updated successfully (+${asset.returnPercent}% interest, Min ₹${asset.minStake}).`,
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

    const isHex24 = /^[0-9a-fA-F]{24}$/.test(id);
    const queryConditions = [
      { id: id },
      { symbol: id.toUpperCase() },
    ];
    if (isHex24) {
      queryConditions.push({ _id: id });
    }

    const asset = await Asset.findOneAndDelete({ $or: queryConditions });

    if (!asset) {
      return res.status(404).json({ success: false, message: 'Stock not found.' });
    }

    return res.status(200).json({
      success: true,
      message: `Stock "${asset.name}" has been removed from system.`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
