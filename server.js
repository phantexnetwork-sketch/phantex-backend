const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const speakeasy = require('speakeasy');


const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// CONFIG — REPLACE VALUES MARKED WITH ****
// ============================================
const CONFIG = {
  SUPABASE_URL: 'https://ubcyuzzpyeukyjefdbaa.supabase.co',
  SUPABASE_SECRET: 'sb_secret_a5wM_CqO06gyjlgwUkqJbA_2WmhbfQ_',
  GMAIL_USER: 'aeb918001@smtp-brevo.com',
  GMAIL_PASS: 'xsmtpsib-c0d425dce657e4d318b591dffa12c0ff64a940f19af52ce50711cb12be6988bb-oqTMfDyQ65PeCcO2', // ← paste your 16 letter app password here
  SMARTLINK: 'https://wwmyokgik.one/cl/142f7946ad0c8b0f',
  ADMIN_USERNAME: 'phantex.4060',
  ADMIN_PASSWORD: 'phantex.904011',
  CONVERSION_PAYOUT: 100, // ₦100 per conversion
  REFERRAL_PAYOUT: 150,   // ₦150 per referral
  MIN_WITHDRAWAL: 1000,   // minimum ₦1000 to withdraw
  MAX_USERS: 10000,       // storage limit
  PORT: process.env.PORT || 3000,
  FRONTEND_URL: 'https://phantex.netlify.app'
};

// ============================================
// DATABASE
// ============================================
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SECRET);

// ============================================
// EMAIL TRANSPORTER
// ============================================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: CONFIG.GMAIL_USER,
    pass: CONFIG.GMAIL_PASS
  }
});

// ============================================
// HELPERS
// ============================================
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateAffiliateId() {
  return 'PX' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function sendEmail(to, subject, html) {
  await transporter.sendMail({
    from: `"Phantex Network" <${CONFIG.GMAIL_USER}>`,
    to,
    subject,
    html
  });
}

// ============================================
// EMAIL TEMPLATES
// ============================================
function verifyEmailTemplate(code) {
  return `
  <div style="font-family:Inter,sans-serif;background:#04060f;padding:40px;max-width:480px;margin:0 auto;border-radius:16px;border:1px solid rgba(59,130,246,0.2)">
    <div style="text-align:center;margin-bottom:32px">
      <h1 style="font-size:28px;font-weight:700;letter-spacing:6px;background:linear-gradient(135deg,#fff,#93c5fd);-webkit-background-clip:text;color:#93c5fd;text-transform:uppercase">PHANTEX</h1>
      <p style="color:rgba(226,232,240,0.5);font-size:12px;letter-spacing:2px;text-transform:uppercase">Performance Network</p>
    </div>
    <h2 style="color:#fff;font-size:20px;margin-bottom:8px">Verify your email</h2>
    <p style="color:rgba(226,232,240,0.5);font-size:14px;margin-bottom:32px;line-height:1.6">Enter this code to activate your Phantex account. It expires in 10 minutes.</p>
    <div style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:12px;padding:24px;text-align:center;margin-bottom:32px">
      <div style="font-size:40px;font-weight:700;letter-spacing:12px;color:#fff">${code}</div>
    </div>
    <p style="color:rgba(226,232,240,0.3);font-size:12px;text-align:center">Do not share this code with anyone. Phantex will never ask for your code.</p>
  </div>`;
}

function resetEmailTemplate(link) {
  return `
  <div style="font-family:Inter,sans-serif;background:#04060f;padding:40px;max-width:480px;margin:0 auto;border-radius:16px;border:1px solid rgba(59,130,246,0.2)">
    <div style="text-align:center;margin-bottom:32px">
      <h1 style="font-size:28px;font-weight:700;letter-spacing:6px;color:#93c5fd;text-transform:uppercase">PHANTEX</h1>
    </div>
    <h2 style="color:#fff;font-size:20px;margin-bottom:8px">Reset your password</h2>
    <p style="color:rgba(226,232,240,0.5);font-size:14px;margin-bottom:32px;line-height:1.6">Click the button below to reset your password. This link expires in 15 minutes.</p>
    <div style="text-align:center;margin-bottom:32px">
      <a href="${link}" style="background:linear-gradient(135deg,#3b82f6,#7c3aed);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">Reset Password</a>
    </div>
    <p style="color:rgba(226,232,240,0.3);font-size:12px;text-align:center">If you didn't request this, ignore this email.</p>
  </div>`;
}

// ============================================
// AUTH ROUTES
// ============================================

// SIGNUP
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, phone, password, referredBy, fingerprint, ip } = req.body;

    // Check user count
    const { count } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (count >= CONFIG.MAX_USERS) {
      return res.status(400).json({ error: 'Platform at capacity. Please try again later.' });
    }

    // Check if email exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    // Check fingerprint fraud
    if (fingerprint) {
      const { data: fpCheck } = await supabase
        .from('users')
        .select('id, email')
        .eq('fingerprint', fingerprint);

      if (fpCheck && fpCheck.length >= 2) {
        // Shadow flag this signup
        await supabase.from('suspicious').insert({
          email,
          reason: 'Multiple accounts same device',
          fingerprint,
          ip,
          created_at: new Date()
        });
      }
    }

    // Hash password
    const hashedPassword = crypto
      .createHash('sha256')
      .update(password + 'phantex_salt')
      .digest('hex');

    // Generate affiliate ID
    const affiliateId = generateAffiliateId();

    // Generate verification code
    const verifyCode = generateCode();
    const verifyExpiry = new Date(Date.now() + 10 * 60 * 1000);

    // Create user
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        name,
        email,
        phone,
        password: hashedPassword,
        affiliate_id: affiliateId,
        referred_by: referredBy || null,
        fingerprint: fingerprint || null,
        ip: ip || null,
        verify_code: verifyCode,
        verify_expiry: verifyExpiry,
        verified: false,
        status: 'pending',
        balance: 0,
        pending_referral: 0,
        total_conversions: 0,
        total_clicks: 0,
        created_at: new Date()
      })
      .select()
      .single();

    if (error) throw error;

    // Send verification email
    await sendEmail(
      email,
      'Your Phantex verification code',
      verifyEmailTemplate(verifyCode)
    );

    res.json({ success: true, message: 'Verification code sent to your email.' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// VERIFY EMAIL
app.post('/api/verify', async (req, res) => {
  try {
    const { email, code } = req.body;

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (!user) return res.status(400).json({ error: 'User not found.' });
    if (user.verified) return res.status(400).json({ error: 'Already verified.' });
    if (user.verify_code !== code) return res.status(400).json({ error: 'Invalid code.' });
    if (new Date() > new Date(user.verify_expiry)) {
      return res.status(400).json({ error: 'Code expired. Request a new one.' });
    }

    // Activate user
    await supabase
      .from('users')
      .update({ verified: true, status: 'active' })
      .eq('email', email);

    res.json({ success: true, message: 'Email verified successfully.' });

  } catch (err) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// RESEND CODE
app.post('/api/resend-code', async (req, res) => {
  try {
    const { email } = req.body;
    const newCode = generateCode();
    const newExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await supabase
      .from('users')
      .update({ verify_code: newCode, verify_expiry: newExpiry })
      .eq('email', email);

    await sendEmail(email, 'Your new Phantex verification code', verifyEmailTemplate(newCode));

    res.json({ success: true, message: 'New code sent.' });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// LOGIN
app.post('/api/login', async (req, res) => {
  try {
    const { email, password, fingerprint, ip } = req.body;

    const hashedPassword = crypto
      .createHash('sha256')
      .update(password + 'phantex_salt')
      .digest('hex');

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('password', hashedPassword)
      .single();

    if (!user) return res.status(400).json({ error: 'Invalid email or password.' });
    if (!user.verified) return res.status(400).json({ error: 'Please verify your email first.' });
    if (user.status === 'banned') return res.status(400).json({ error: 'Account suspended. Contact support.' });

    // Update last seen + online status
    await supabase
      .from('users')
      .update({ last_seen: new Date(), online: true })
      .eq('id', user.id);

    // Generate session token
    const token = generateToken();
    await supabase.from('sessions').insert({
      user_id: user.id,
      token,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        affiliate_id: user.affiliate_id,
        balance: user.balance,
        pending_referral: user.pending_referral,
        total_conversions: user.total_conversions,
        total_clicks: user.total_clicks
      }
    });

  } catch (err) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// FORGOT PASSWORD
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (!user) return res.status(400).json({ error: 'Email not found.' });

    const token = generateToken();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    await supabase.from('password_resets').insert({
      email,
      token,
      expires_at: expiry,
      used: false
    });

    const resetLink = `${CONFIG.FRONTEND_URL}?reset=${token}`;
    await sendEmail(email, 'Reset your Phantex password', resetEmailTemplate(resetLink));

    res.json({ success: true, message: 'Reset link sent to your email.' });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// RESET PASSWORD
app.post('/api/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    const { data: reset } = await supabase
      .from('password_resets')
      .select('*')
      .eq('token', token)
      .eq('used', false)
      .single();

    if (!reset) return res.status(400).json({ error: 'Invalid or expired reset link.' });
    if (new Date() > new Date(reset.expires_at)) {
      return res.status(400).json({ error: 'Reset link expired.' });
    }

    const hashedPassword = crypto
      .createHash('sha256')
      .update(password + 'phantex_salt')
      .digest('hex');

    await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('email', reset.email);

    await supabase
      .from('password_resets')
      .update({ used: true })
      .eq('token', token);

    res.json({ success: true, message: 'Password reset successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// ============================================
// AFFILIATE ROUTES
// ============================================

// GET DASHBOARD DATA
app.get('/api/dashboard', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized.' });

    const { data: session } = await supabase
      .from('sessions')
      .select('user_id')
      .eq('token', token)
      .single();

    if (!session) return res.status(401).json({ error: 'Session expired.' });

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', session.user_id)
      .single();

    // Get conversions
    const { data: conversions } = await supabase
      .from('conversions')
      .select('*')
      .eq('affiliate_id', user.affiliate_id)
      .order('created_at', { ascending: false })
      .limit(20);

    // Get referrals
    const { data: referrals } = await supabase
      .from('users')
      .select('name, email, status, created_at, balance')
      .eq('referred_by', user.affiliate_id);

    // Build tracking link
    const trackingLink = `${CONFIG.SMARTLINK}?p1=${user.affiliate_id}`;
    const referralLink = `${CONFIG.FRONTEND_URL}?ref=${user.affiliate_id}`;

    res.json({
      success: true,
      user: {
        name: user.name,
        email: user.email,
        affiliate_id: user.affiliate_id,
        balance: user.balance,
        pending_referral: user.pending_referral,
        total_conversions: user.total_conversions,
        total_clicks: user.total_clicks,
        status: user.status
      },
      tracking_link: trackingLink,
      referral_link: referralLink,
      conversions: conversions || [],
      referrals: referrals || []
    });

  } catch (err) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// TRACK CLICK
app.post('/api/click', async (req, res) => {
  try {
    const { affiliate_id } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    await supabase.from('clicks').insert({
      affiliate_id,
      ip,
      created_at: new Date()
    });

    await supabase.rpc('increment_clicks', { aff_id: affiliate_id });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// REQUEST WITHDRAWAL
app.post('/api/withdraw', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const { amount, account_number, bank_name } = req.body;

    const { data: session } = await supabase
      .from('sessions')
      .select('user_id')
      .eq('token', token)
      .single();

    if (!session) return res.status(401).json({ error: 'Unauthorized.' });

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', session.user_id)
      .single();

    if (user.status === 'shadow_banned') {
      return res.status(400).json({ error: 'Your account is under review. Contact support.' });
    }

    if (amount < CONFIG.MIN_WITHDRAWAL) {
      return res.status(400).json({ error: `Minimum withdrawal is ₦${CONFIG.MIN_WITHDRAWAL}.` });
    }

    if (user.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance.' });
    }

    // Create withdrawal request
    await supabase.from('withdrawals').insert({
      user_id: user.id,
      affiliate_id: user.affiliate_id,
      amount,
      account_number,
      bank_name,
      status: 'pending',
      created_at: new Date()
    });

    // Deduct from balance
    await supabase
      .from('users')
      .update({ balance: user.balance - amount })
      .eq('id', user.id);

    // Check if referred user has withdrawn — credit referrer
    if (user.referred_by) {
      const { data: referrer } = await supabase
        .from('users')
        .select('*')
        .eq('affiliate_id', user.referred_by)
        .single();

      if (referrer && referrer.pending_referral > 0) {
        const settings = await getSettings();
        await supabase
          .from('users')
          .update({
            balance: referrer.balance + settings.referral_payout,
            pending_referral: referrer.pending_referral - settings.referral_payout
          })
          .eq('affiliate_id', user.referred_by);
      }
    }

    res.json({ success: true, message: 'Withdrawal request submitted.' });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// ============================================
// POSTBACK RECEIVER FROM GGNET
// ============================================
app.get('/postback', async (req, res) => {
  try {
    const { p1, status, payout } = req.query;

    if (!p1) return res.status(400).send('Missing affiliate ID');

    // Find affiliate
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('affiliate_id', p1)
      .single();

    if (!user) return res.status(404).send('Affiliate not found');

    // Only credit on successful conversions
    if (status === 'approved' || status === '1' || !status) {
      const settings = await getSettings();

      // Record conversion
      await supabase.from('conversions').insert({
        affiliate_id: p1,
        user_id: user.id,
        payout: settings.conversion_payout,
        gg_payout: payout || 0,
        status: 'approved',
        created_at: new Date()
      });

      // Credit affiliate
      await supabase
        .from('users')
        .update({
          balance: user.balance + settings.conversion_payout,
          total_conversions: user.total_conversions + 1
        })
        .eq('affiliate_id', p1);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
});

// ============================================
// ADMIN ROUTES
// ============================================

// ADMIN LOGIN
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password, totp } = req.body;

    if (username !== CONFIG.ADMIN_USERNAME || password !== CONFIG.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Verify Google Authenticator code
    const { data: settings } = await supabase
      .from('settings')
      .select('admin_totp_secret')
      .single();

    if (settings?.admin_totp_secret) {
      const verified = speakeasy.totp.verify({
        secret: settings.admin_totp_secret,
        encoding: 'base32',
        token: totp,
        window: 2
      });
      if (!verified) return res.status(401).json({ error: 'Invalid authenticator code.' });
    }

    const token = generateToken();
    await supabase.from('admin_sessions').insert({
      token,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// GET ADMIN DASHBOARD
app.get('/api/admin/dashboard', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const { data: session } = await supabase
      .from('admin_sessions')
      .select('*')
      .eq('token', token)
      .single();

    if (!session) return res.status(401).json({ error: 'Unauthorized.' });

    const now = new Date();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000);

    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    const { count: activeUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    const { count: newUsers24h } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', yesterday.toISOString());

    const { count: onlineUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('last_seen', new Date(now - 5 * 60 * 1000).toISOString());

    const { count: totalConversions } = await supabase
      .from('conversions')
      .select('*', { count: 'exact', head: true });

    const { data: pendingWithdrawals } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    const { data: suspicious } = await supabase
      .from('suspicious')
      .select('*')
      .order('created_at', { ascending: false });

    const settings = await getSettings();

    res.json({
      success: true,
      stats: {
        total_users: totalUsers,
        active_users: activeUsers,
        new_users_24h: newUsers24h,
        online_users: onlineUsers,
        total_conversions: totalConversions,
        storage_percent: Math.round((totalUsers / CONFIG.MAX_USERS) * 100)
      },
      pending_withdrawals: pendingWithdrawals || [],
      suspicious: suspicious || [],
      settings
    });

  } catch (err) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});// GET ALL USERS FOR EXPORT
app.get('/api/admin/users/export', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const { data: session } = await supabase
      .from('admin_sessions')
      .select('*')
      .eq('token', token)
      .single();

    if (!session) return res.status(401).json({ error: 'Unauthorized.' });

    const { data: users } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    res.json({ success: true, users: users || [] });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// PARTNER LOGIN
app.post('/api/partner/login', async (req, res) => {
  try {
    const { username, password, totp } = req.body;

    const { data: settings } = await supabase
      .from('settings')
      .select('partner_username, partner_password, partner_totp_secret')
      .single();

    if (username !== settings.partner_username || 
        password !== settings.partner_password) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (settings.partner_totp_secret) {
      const verified = speakeasy.totp.verify({
        secret: settings.partner_totp_secret,
        encoding: 'base32',
        token: totp,
        window: 2
      });
      if (!verified) return res.status(401).json({ error: 'Invalid authenticator code.' });
    }

    const token = generateToken();
    await supabase.from('partner_sessions').insert({
      token,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// PARTNER DASHBOARD — READ ONLY
app.get('/api/partner/dashboard', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const { data: session } = await supabase
      .from('partner_sessions')
      .select('*')
      .eq('token', token)
      .single();

    if (!session) return res.status(401).json({ error: 'Unauthorized.' });

    const now = new Date();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000);

    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    const { count: activeUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    const { count: newUsers24h } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', yesterday.toISOString());

    const { count: onlineUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('last_seen', new Date(now - 5 * 60 * 1000).toISOString());

    const { count: totalConversions } = await supabase
      .from('conversions')
      .select('*', { count: 'exact', head: true });

    const { count: conversions24h } = await supabase
      .from('conversions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', yesterday.toISOString());

    res.json({
      success: true,
      stats: {
        total_users: totalUsers,
        active_users: activeUsers,
        new_users_24h: newUsers24h,
        online_users: onlineUsers,
        total_conversions: totalConversions,
        conversions_24h: conversions24h
      }
    });

  } catch (err) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// FRAUD DETECTION — runs on every signup/login
app.post('/api/fraud-check', async (req, res) => {
  try {
    const { fingerprint, ip, email } = req.body;

    let suspicious = false;
    let reasons = [];

    // Check same fingerprint
    if (fingerprint) {
      const { data: fpAccounts } = await supabase
        .from('users')
        .select('id, email')
        .eq('fingerprint', fingerprint);

      if (fpAccounts && fpAccounts.length >= 2) {
        suspicious = true;
        reasons.push('Multiple accounts same device');
      }
    }

    // Check same IP — more than 3 accounts
    if (ip) {
      const { data: ipAccounts } = await supabase
        .from('users')
        .select('id, email')
        .eq('ip', ip);

      if (ipAccounts && ipAccounts.length >= 3) {
        suspicious = true;
        reasons.push('Multiple accounts same IP');
      }
    }

    // Check referral abuse — too many referrals too fast
    const { data: recentReferrals } = await supabase
      .from('users')
      .select('id')
      .eq('referred_by', email)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

    if (recentReferrals && recentReferrals.length >= 5) {
      suspicious = true;
      reasons.push('Referral abuse — 5+ referrals in 1 hour');
    }

    if (suspicious) {
      await supabase.from('suspicious').insert({
        email,
        reason: reasons.join(', '),
        fingerprint,
        ip,
        created_at: new Date()
      });

      // Shadow ban
      await supabase
        .from('users')
        .update({ status: 'shadow_banned' })
        .eq('email', email);
    }

    res.json({ success: true, suspicious });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// LOGOUT
app.post('/api/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    await supabase.from('sessions').delete().eq('token', token);
    
    // Set offline
    const { data: session } = await supabase
      .from('sessions')
      .select('user_id')
      .eq('token', token)
      .single();

    if (session) {
      await supabase
        .from('users')
        .update({ online: false })
        .eq('id', session.user_id);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: true });
  }
});

// HEALTH CHECK
app.get('/health', (req, res) => {
  res.json({ status: 'Phantex server is running', time: new Date() });
});
// START SERVER
app.listen(CONFIG.PORT, () => {
  console.log(`Phantex backend running on port ${CONFIG.PORT}`);
});
