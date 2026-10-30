import fs from 'fs';
import path from 'path';
import Asset from '../models/asset.model.js';
import Setting from '../models/setting.model.js';
import { initialAssetsList } from '../utils/initialAssets.js';

export const G1 = ['TATAMOTORS', 'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'ITC', 'LT', 'BHARTIARTL', 'HINDUNILVR', 'AXISBANK'];
export const G2 = ['KOTAKBANK', 'BAJFINANCE', 'MARUTI', 'SUNPHARMA', 'ADANIENT', 'ADANIPORTS', 'TATASTEEL', 'TITAN', 'ASIANPAINT', 'NTPC', 'POWERGRID', 'COALINDIA'];
export const G3 = ['M&M', 'MM', 'WIPRO', 'ULTRACEMCO', 'BAJAJFINSV', 'ONGC', 'NESTLEIND', 'JSWSTEEL', 'TECHM', 'INDUSINDBK', 'TATACONSUM', 'HINDALCO', 'CIPLA'];
export const G4 = ['DRREDDY', 'GRASIM', 'SBILIFE', 'HDFCLIFE', 'APOLLOHOSP', 'EICHERMOT', 'DIVISLAB', 'HEROMOTOCO', 'BAJAJ-AUTO', 'BRITANNIA', 'BPCL', 'ZOMATO'];
export const G5 = [
  'JIOFIN', 'PAYTM', 'AAPL', 'TSLA', 'NVDA', 'MSFT',
  'BTC/USDT', 'BTC', 'ETH/USDT', 'ETH', 'SOL/USDT', 'SOL', 'BNB/USDT', 'BNB',
  'USDT/INR', 'USDT', 'XRP/USDT', 'XRP', 'DOGE/USDT', 'DOGE',
  'ADA/USDT', 'ADA', 'TRX/USDT', 'TRX', 'MATIC/USDT', 'MATIC',
  'DOT/USDT', 'DOT', 'LTC/USDT', 'LTC', 'AVAX/USDT', 'AVAX',
  'GOLD/INR', 'GOLD', 'SILVER/INR', 'SILVER'
];

export const DEFAULT_GROUP_INTEREST = { 1: 8, 2: 11.5, 3: 11.5, 4: 11.5, 5: 11.5 };

export const getAssetGroup = (asset, index = 0) => {
  const sym = (asset?.symbol || asset?.id || '').toUpperCase();
  if (G1.includes(sym)) return 1;
  if (G2.includes(sym)) return 2;
  if (G3.includes(sym)) return 3;
  if (G4.includes(sym)) return 4;
  if (G5.includes(sym)) return 5;
  if (asset?.group && Number(asset.group) >= 1 && Number(asset.group) <= 5) {
    return Number(asset.group);
  }
  return Math.min(5, Math.floor(index / 12) + 1);
};

// @desc    Get all stocks / crypto assets for trading portal & user apk (with live isEnabled flag)
// @route   GET /api/assets
export const getPublicAssets = async (req, res) => {
  try {
    // 1. Fetch setting first (contains groupQrs, groupInterestRates, defaultGameProfitPercent, officialUpiId)
    const setting = await Setting.findOne({ key: 'main_config' }).lean();
    const masterEngineRate = Math.max(1, Number(setting?.defaultGameProfitPercent) || 5);
    const rawGroupQrs = setting?.groupQrs || {};
    const groupQrs = { ...rawGroupQrs };

    // Auto-migrate heavy base64 strings to disk files to prevent heap memory exhaustion
    for (let g = 1; g <= 5; g++) {
      const q = (groupQrs[g] || groupQrs[String(g)] || '').trim();
      if (q.startsWith('data:image')) {
        try {
          const matches = q.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const ext = matches[1] === 'jpeg' ? 'jpg' : 'png';
            const buffer = Buffer.from(matches[2], 'base64');
            const uploadDir = path.join(process.cwd(), 'uploads');
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
            const fileName = `group_qr_${g}.${ext}`;
            fs.writeFileSync(path.join(uploadDir, fileName), buffer);
            const relativeUrl = `/uploads/${fileName}`;
            groupQrs[g] = relativeUrl;
            groupQrs[String(g)] = relativeUrl;
            // Asynchronous fire-and-forget DB update
            Setting.updateOne(
              { key: 'main_config' },
              { $set: { [`groupQrs.${g}`]: relativeUrl, [`groupQrs.${String(g)}`]: relativeUrl } }
            ).exec().catch(() => null);
          }
        } catch (_) {}
      }
    }

    const settingGroupRates = setting?.groupInterestRates || {};
    const groupInterestRates = {
      ...DEFAULT_GROUP_INTEREST,
      ...(typeof settingGroupRates === 'object' ? settingGroupRates : {}),
    };
    const officialUpi = setting?.officialUpiId || setting?.upiId || 'paynex.crypto@icici';

    // 2. Fetch assets from DB with 3s max timeout and lean() to prevent memory lag
    let rawAssets = [];
    try {
      rawAssets = await Asset.find({}).select('+qrCode').lean().maxTimeMS(5000);
    } catch (err) {
      console.warn('Asset.find notice, falling back to initialAssetsList:', err.message);
    }
    if (!rawAssets || rawAssets.length === 0) {
      rawAssets = initialAssetsList;
    }

    const mappedAssets = rawAssets.map((a, idx) => {
      const grp = getAssetGroup(a, idx);
      // Group Rate is authoritative for all stocks in each group (Groups 1 to 5)
      const groupRate = (groupInterestRates[grp] !== undefined && groupInterestRates[grp] !== null)
        ? Number(groupInterestRates[grp])
        : (groupInterestRates[String(grp)] !== undefined && groupInterestRates[String(grp)] !== null)
          ? Number(groupInterestRates[String(grp)])
          : (DEFAULT_GROUP_INTEREST[grp] || 5);
      const effectiveRate = Math.max(1, groupRate);

      const individualQr = (a.qrCode && typeof a.qrCode === 'string' && a.qrCode.trim().length > 0)
        ? a.qrCode.trim()
        : '';
      const grpQr = (groupQrs[grp] && groupQrs[grp].trim()) || (groupQrs[String(grp)] && groupQrs[String(grp)].trim());
      // Avoid duplicating giant base64 into 60 individual items; use lightweight URL
      const effectiveQr = (individualQr && !individualQr.startsWith('data:image'))
        ? individualQr
        : (grpQr || individualQr);

      return {
        ...a,
        group: grp,
        qrCode: effectiveQr,
        upiId: (a.upiId && a.upiId.trim().length > 0) ? a.upiId.trim() : officialUpi,
        returnPercent: effectiveRate,
        minStake: Math.max(1000, Number(a.minStake) || 1000),
        isEnabled: a.isEnabled !== false,
      };
    });

    const activeAssets = mappedAssets.filter((a) => a.isEnabled !== false);
    return res.status(200).json({
      success: true,
      count: activeAssets.length,
      activeCount: activeAssets.length,
      assets: activeAssets,
      allAssets: mappedAssets,
      groupQrs,
      groupInterestRates,
      defaultGameProfitPercent: masterEngineRate,
      officialUpiId: officialUpi,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Toggle stock / asset active status (Enabled vs Disabled)
// @route   PUT /api/assets/admin/toggle-status
export const toggleAssetStatus = async (req, res) => {
  try {
    const rawId = req.params.id || req.body.id || req.body.symbol || req.body._id;
    const { isEnabled, symbol, _id, id } = req.body;

    if (isEnabled === undefined || isEnabled === null) {
      return res.status(400).json({
        success: false,
        message: 'Status flag (isEnabled) is required as a boolean.',
      });
    }

    const nextEnabled = Boolean(isEnabled);

    const queryConditions = [];
    if (_id && /^[0-9a-fA-F]{24}$/.test(_id)) {
      queryConditions.push({ _id });
    }
    if (rawId && /^[0-9a-fA-F]{24}$/.test(rawId)) {
      queryConditions.push({ _id: rawId });
    }
    if (rawId) {
      queryConditions.push({ id: rawId });
      queryConditions.push({ symbol: rawId.toUpperCase() });
      queryConditions.push({ id: decodeURIComponent(rawId) });
      queryConditions.push({ symbol: decodeURIComponent(rawId).toUpperCase() });
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

    const updatedAsset = await Asset.findOneAndUpdate(
      { $or: queryConditions },
      { $set: { isEnabled: nextEnabled } },
      { new: true, runValidators: false }
    );

    if (!updatedAsset) {
      return res.status(404).json({ success: false, message: 'Stock asset not found.' });
    }

    return res.status(200).json({
      success: true,
      message: `Stock "${updatedAsset.name}" (${updatedAsset.symbol}) is now ${updatedAsset.isEnabled ? 'ACTIVE / ENABLED' : 'DISABLED'}.`,
      asset: updatedAsset,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Enable all stocks & game assets (1-Click Restore / Activate All 50+ Assets)
// @route   PUT /api/assets/admin/enable-all
export const enableAllAssets = async (req, res) => {
  try {
    const result = await Asset.updateMany({}, { $set: { isEnabled: true } });
    return res.status(200).json({
      success: true,
      message: `All ${result.matchedCount || 50}+ stocks and assets are now ACTIVE and tradable!`,
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount,
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

    const [assets, setting] = await Promise.all([
      Asset.find(query).select('+qrCode').lean().maxTimeMS(5000),
      Setting.findOne({ key: 'main_config' }).lean(),
    ]);
    const masterEngineRate = Math.max(1, Number(setting?.defaultGameProfitPercent) || 5);
    const groupQrs = setting?.groupQrs || {};
    const settingGroupRates = setting?.groupInterestRates || {};
    const groupInterestRates = {
      ...DEFAULT_GROUP_INTEREST,
      ...(typeof settingGroupRates === 'object' ? settingGroupRates : {}),
    };

    const mappedAssets = assets.map((a, idx) => {
      const grp = getAssetGroup(a, idx);
      // Group QR is authoritative when set
      const effectiveQr = (groupQrs && (groupQrs[grp] || groupQrs[String(grp)]) && (groupQrs[grp] || groupQrs[String(grp)]).trim().length > 0)
        ? (groupQrs[grp] || groupQrs[String(grp)]).trim()
        : (a.qrCode || '');
      // Group Rate is authoritative for all stocks in each group (Groups 1 to 5)
      const groupRate = (groupInterestRates[grp] !== undefined && groupInterestRates[grp] !== null)
        ? Number(groupInterestRates[grp])
        : (groupInterestRates[String(grp)] !== undefined && groupInterestRates[String(grp)] !== null)
          ? Number(groupInterestRates[String(grp)])
          : (DEFAULT_GROUP_INTEREST[grp] || 5);
      const effectiveRate = Math.max(1, groupRate);

      return {
        ...a,
        group: grp,
        qrCode: effectiveQr,
        upiId: (a.upiId && a.upiId.trim().length > 0) ? a.upiId.trim() : (setting?.officialUpiId || setting?.upiId || 'paynex.crypto@icici'),
        returnPercent: effectiveRate,
        minStake: Math.max(1000, Number(a.minStake) || 1000),
        isEnabled: a.isEnabled !== false,
      };
    });

    const totalCount = mappedAssets.length;
    const activeCount = mappedAssets.filter(a => a.isEnabled !== false).length;
    const stockCount = mappedAssets.filter(a => a.category === 'Stock').length;
    const cryptoCount = mappedAssets.filter(a => a.category === 'Crypto').length;

    return res.status(200).json({
      success: true,
      stats: { totalCount, activeCount, stockCount, cryptoCount },
      assets: mappedAssets,
      groupQrs,
      groupInterestRates,
      defaultGameProfitPercent: masterEngineRate,
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

    const targetReturn = Math.max(1, Number(returnPercent) || 5);
    const targetMinStake = Number(minStake) || 100;
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
      group: Math.min(5, Math.max(1, Number(req.body.group) || getAssetGroup({ symbol: cleanSymbol }))),
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

    // Route alias safeguards
    const isGroupNumber = /^[1-5]$/.test(String(rawId || '').trim());
    if (rawId === 'bulk-group-qr' || req.params?.id === 'bulk-group-qr' || (isGroupNumber && (updates.qrCode !== undefined || req.body.qrCode !== undefined))) {
      if (isGroupNumber) req.body.group = Number(rawId);
      return updateGroupQr(req, res);
    }
    if (rawId === 'bulk-group-interest' || req.params?.id === 'bulk-group-interest' || (isGroupNumber && (updates.returnPercent !== undefined || updates.rate !== undefined))) {
      if (isGroupNumber) req.body.group = Number(rawId);
      return updateGroupInterestRate(req, res);
    }
    if (rawId === 'toggle-status' || req.params?.id === 'toggle-status') {
      return toggleAssetStatus(req, res);
    }

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

    // Build clean update object
    const updateFields = {};
    if (updates.name !== undefined) updateFields.name = updates.name.trim();
    if (updates.category !== undefined) updateFields.category = updates.category;
    if (updates.basePrice !== undefined) updateFields.basePrice = Number(updates.basePrice);
    if (updates.step !== undefined) updateFields.step = Number(updates.step);
    if (updates.icon !== undefined) updateFields.icon = updates.icon;
    if (updates.color !== undefined) updateFields.color = updates.color;
    if (updates.returnPercent !== undefined) {
      updateFields.returnPercent = Math.min(100, Math.max(0, Number(updates.returnPercent)));
    }
    if (updates.minStake !== undefined) {
      updateFields.minStake = Math.max(1, Number(updates.minStake));
    }
    if (updates.maxStake !== undefined) updateFields.maxStake = Number(updates.maxStake);
    if (updates.isEnabled !== undefined) updateFields.isEnabled = Boolean(updates.isEnabled);
    if (updates.upiId !== undefined) updateFields.upiId = updates.upiId.trim();
    if (updates.qrCode !== undefined) updateFields.qrCode = updates.qrCode;
    if (updates.payeeName !== undefined) updateFields.payeeName = updates.payeeName.trim();
    if (updates.description !== undefined) updateFields.description = updates.description;
    if (updates.group !== undefined) updateFields.group = Math.min(5, Math.max(1, Number(updates.group) || 1));

    const asset = await Asset.findOneAndUpdate(
      { $or: queryConditions },
      { $set: updateFields },
      { new: true, upsert: false, runValidators: false }
    );

    if (!asset) {
      return res.status(404).json({ success: false, message: 'Stock asset not found.' });
    }

    if (updates.returnPercent !== undefined) {
      const cleanRate = Math.max(1, Number(updates.returnPercent));
      const targetGrp = asset.group || getAssetGroup(asset);
      if (targetGrp >= 1 && targetGrp <= 5) {
        const groupsList = [G1, G2, G3, G4, G5];
        const syms = groupsList[targetGrp - 1] || [];
        const symsLower = syms.map((s) => s.toLowerCase());
        await Asset.updateMany(
          { $or: [{ group: targetGrp }, { symbol: { $in: [...syms, ...symsLower] } }, { id: { $in: [...syms, ...symsLower] } }] },
          { $set: { returnPercent: cleanRate, group: targetGrp } }
        );
        let settingDoc = await Setting.findOne({ key: 'main_config' });
        if (!settingDoc) {
          settingDoc = new Setting({ key: 'main_config', groupInterestRates: { ...DEFAULT_GROUP_INTEREST } });
        }
        if (!settingDoc.groupInterestRates) settingDoc.groupInterestRates = { ...DEFAULT_GROUP_INTEREST };
        settingDoc.groupInterestRates[targetGrp] = cleanRate;
        settingDoc.groupInterestRates[String(targetGrp)] = cleanRate;
        settingDoc.markModified('groupInterestRates');
        await settingDoc.save();
      }
    }

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

// @desc    Bulk Update QR code for an entire group of companies (Groups 1 to 5)
// @route   PUT /api/admin/assets/bulk-group-qr
export const updateGroupQr = async (req, res) => {
  try {
    const { group, qrCode } = req.body;
    const numGroup = Math.min(5, Math.max(1, Number(group) || 1));
    let cleanQr = (qrCode || '').trim();

    // Auto-save heavy base64 to server disk to keep MongoDB response lightweight & prevent heap crash
    if (cleanQr.startsWith('data:image')) {
      try {
        const matches = cleanQr.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const ext = matches[1] === 'jpeg' ? 'jpg' : 'png';
          const buffer = Buffer.from(matches[2], 'base64');
          const uploadDir = path.join(process.cwd(), 'uploads');
          if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
          const fileName = `group_qr_${numGroup}.${ext}`;
          fs.writeFileSync(path.join(uploadDir, fileName), buffer);
          cleanQr = `/uploads/${fileName}`;
        }
      } catch (e) {
        console.warn('QR file save fallback:', e.message);
      }
    }

    const groupsList = [G1, G2, G3, G4, G5];
    const targetSymbols = groupsList[numGroup - 1] || [];
    const targetSymbolsLower = targetSymbols.map((s) => s.toLowerCase());

    // Instant parallel atomic update (<100ms) - eliminates slow 15-iteration sequential loop
    const [result, setting] = await Promise.all([
      Asset.updateMany(
        {
          $or: [
            { group: numGroup },
            { symbol: { $in: [...targetSymbols, ...targetSymbolsLower] } },
            { id: { $in: [...targetSymbols, ...targetSymbolsLower] } },
          ],
        },
        {
          $set: {
            qrCode: cleanQr,
            group: numGroup,
          },
        }
      ),
      Setting.findOneAndUpdate(
        { key: 'main_config' },
        {
          $set: {
            [`groupQrs.${numGroup}`]: cleanQr,
            [`groupQrs.${String(numGroup)}`]: cleanQr,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ),
    ]);

    return res.status(200).json({
      success: true,
      message: `Group ${numGroup} payment QR updated in 1-Click!`,
      group: numGroup,
      qrCode: cleanQr,
      matchedCount: result?.matchedCount || 0,
      modifiedCount: result?.modifiedCount || 0,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Bulk Update Interest Rate (%) for an entire group of companies (Groups 1 to 5)
// @route   PUT /api/admin/assets/bulk-group-interest
export const updateGroupInterestRate = async (req, res) => {
  try {
    const { group, returnPercent, rate } = req.body;
    const numGroup = Math.min(5, Math.max(1, Number(group) || 1));
    const targetRate = Math.max(1, Number(returnPercent ?? rate) || 5);

    const groupsList = [G1, G2, G3, G4, G5];
    const targetSymbols = groupsList[numGroup - 1] || [];
    const targetSymbolsLower = targetSymbols.map((s) => s.toLowerCase());

    // Instant parallel atomic update (<100ms) - eliminates slow 15-iteration sequential loop
    const [result, setting] = await Promise.all([
      Asset.updateMany(
        {
          $or: [
            { group: numGroup },
            { symbol: { $in: [...targetSymbols, ...targetSymbolsLower] } },
            { id: { $in: [...targetSymbols, ...targetSymbolsLower] } },
          ],
        },
        {
          $set: {
            returnPercent: targetRate,
            group: numGroup,
          },
        }
      ),
      Setting.findOneAndUpdate(
        { key: 'main_config' },
        {
          $set: {
            [`groupInterestRates.${numGroup}`]: targetRate,
            [`groupInterestRates.${String(numGroup)}`]: targetRate,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ),
    ]);

    return res.status(200).json({
      success: true,
      message: `Group ${numGroup} interest rate updated to +${targetRate}% in 1-Click!`,
      group: numGroup,
      returnPercent: targetRate,
      groupInterestRates: setting?.groupInterestRates,
      matchedCount: result?.matchedCount || 0,
      modifiedCount: result?.modifiedCount || 0,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
