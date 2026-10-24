import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Asset from './models/asset.model.js';

const run = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://digitalgurucse_db_user:ioF1YoKMaxUnSTmv@cluster0.d4trb33.mongodb.net/paynex?retryWrites=true&w=majority';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB Atlas:', mongoose.connection.name);

    const assets = await Asset.find();
    console.log(`Found ${assets.length} assets to check/update with Company QR & UPI...`);

    let updated = 0;
    for (const a of assets) {
      const cleanSym = a.symbol.toLowerCase().replace(/[^a-z0-9]/g, '');
      const defaultUpi = a.upiId || `${cleanSym}.paynex@icici`;
      const defaultPayee = a.payeeName || `${a.name} Trading Desk`;
      const upiUrl = `upi://pay?pa=${defaultUpi}&pn=${encodeURIComponent(defaultPayee)}&cu=INR`;
      const defaultQr = a.qrCode || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUrl)}`;

      a.upiId = defaultUpi;
      a.payeeName = defaultPayee;
      if (!a.qrCode) {
        a.qrCode = defaultQr;
      }
      await a.save();
      updated++;
    }

    console.log(`Successfully updated ${updated} companies with their dedicated QR Code and UPI ID!`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Update error:', err);
    process.exit(1);
  }
};

run();
