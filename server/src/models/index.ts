import mongoose, { Schema, Document } from 'mongoose';

// ─── Anonymous Usage ───────────────────────────────────────────────────────────
export interface IAnonUsage extends Document {
    uuid: string;
    request_count: number;
    tokens_used: number;
    created_at: Date;
    last_seen: Date;
}

const AnonUsageSchema = new Schema<IAnonUsage>({
    uuid:          { type: String, required: true, unique: true, index: true },
    request_count: { type: Number, default: 0 },
    tokens_used:   { type: Number, default: 0 },
    created_at:    { type: Date, default: Date.now },
    last_seen:     { type: Date, default: Date.now },
});

export const AnonUsage = mongoose.model<IAnonUsage>('AnonUsage', AnonUsageSchema);


// ─── User ──────────────────────────────────────────────────────────────────────
export interface IUser extends Document {
    email: string;
    github_id: string;
    github_username: string;
    name: string;
    plan: 'free' | 'pro';
    created_at: Date;
}

const UserSchema = new Schema<IUser>({
    email:           { type: String, required: true, unique: true },
    github_id:       { type: String, required: true, unique: true, index: true },
    github_username: { type: String, required: true },
    name:            { type: String, default: '' },
    plan:            { type: String, enum: ['free', 'pro'], default: 'free' },
    created_at:      { type: Date, default: Date.now },
});

export const User = mongoose.model<IUser>('User', UserSchema);


// ─── Access Token ──────────────────────────────────────────────────────────────
export interface IAccessToken extends Document {
    token: string;
    user_id: mongoose.Types.ObjectId;
    created_at: Date;
    expires_at: Date;
}

const AccessTokenSchema = new Schema<IAccessToken>({
    token:      { type: String, required: true, unique: true, index: true },
    user_id:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    created_at: { type: Date, default: Date.now },
    expires_at: { type: Date, required: true },
});

export const AccessToken = mongoose.model<IAccessToken>('AccessToken', AccessTokenSchema);


// ─── Device Code ──────────────────────────────────────────────────────────────
export interface IDeviceCode extends Document {
    device_code:  string;
    user_code:    string;
    user_id:      mongoose.Types.ObjectId | null;
    access_token: string | null;
    status:       'pending' | 'complete' | 'expired';
    created_at:   Date;
    expires_at:   Date;
}

const DeviceCodeSchema = new Schema<IDeviceCode>({
    device_code:  { type: String, required: true, unique: true, index: true },
    user_code:    { type: String, required: true, index: true },
    user_id:      { type: Schema.Types.ObjectId, ref: 'User', default: null },
    access_token: { type: String, default: null },
    status:       { type: String, enum: ['pending', 'complete', 'expired'], default: 'pending' },
    created_at:   { type: Date, default: Date.now },
    expires_at:   { type: Date, required: true },
});

export const DeviceCode = mongoose.model<IDeviceCode>('DeviceCode', DeviceCodeSchema);


// ─── Monthly Usage ─────────────────────────────────────────────────────────────
export interface IUsage extends Document {
    user_id:       mongoose.Types.ObjectId;
    month:         string;
    request_count: number;
    tokens_used:   number;
}

const UsageSchema = new Schema<IUsage>({
    user_id:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
    month:         { type: String, required: true },
    request_count: { type: Number, default: 0 },
    tokens_used:   { type: Number, default: 0 },
});

UsageSchema.index({ user_id: 1, month: 1 }, { unique: true });

export const Usage = mongoose.model<IUsage>('Usage', UsageSchema);


// ─── Subscription (wired now, built later) ────────────────────────────────────
export interface ISubscription extends Document {
    user_id:            mongoose.Types.ObjectId;
    stripe_customer_id: string;
    stripe_sub_id:      string;
    status:             'active' | 'cancelled' | 'past_due';
    current_period_end: Date;
}

const SubscriptionSchema = new Schema<ISubscription>({
    user_id:            { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    stripe_customer_id: { type: String, default: '' },
    stripe_sub_id:      { type: String, default: '' },
    status:             { type: String, enum: ['active', 'cancelled', 'past_due'], default: 'active' },
    current_period_end: { type: Date },
});

export const Subscription = mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
