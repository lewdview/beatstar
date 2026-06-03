import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import {
  getCurrentDay, getRarityRoll, drawCardDays, RARITY_CONFIG, rollDailyClaimRarity,
  degradeRarity, upgradeRarity, getEchoSpawnChance, getEffectiveBurnYield,
  getPityFloor, RC1_TEST_MODE, TOKEN_PACK_COST, TARGETED_PULL_COST, RARITY_UPGRADE_COST,
  RC1_DAILY_STANDARD_LIMIT, RC1_DAILY_PREMIUM_LIMIT,
  MINTABLE_CAPS, NFT_MINT_COSTS,
  type Rarity, type ModifierContext
} from "./gameLogic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getSupplyCap(rarity: string, cardDay: number, currentDay: number): number {
  if (rarity === 'mythic') return 1;

  const age = Math.max(0, currentDay - cardDay);

  if (age >= 180) {
    const caps: Record<string, number> = {
      mythic: 1,
      legendary: 5,
      rare: 50,
      uncommon: 500,
      common: 1000
    };
    return caps[rarity] || 1000;
  } else if (age >= 30) {
    const caps: Record<string, number> = {
      mythic: 1,
      legendary: 3,
      rare: 35,
      uncommon: 250,
      common: 500
    };
    return caps[rarity] || 250;
  } else {
    // Launch Week
    const caps: Record<string, number> = {
      mythic: 1,
      legendary: 2,
      rare: 15,
      uncommon: 100,
      common: 250
    };
    return caps[rarity] || 250;
  }
}

/** Log a telemetry event (fire-and-forget). */
async function logTelemetry(svc: any, type: string, userId: string | null, payload: any) {
  try {
    await svc.rpc('log_telemetry_event', { p_event_type: type, p_user_id: userId, p_payload: payload });
  } catch { /* non-blocking */ }
}

async function generateCards(svc: any, userId: string, packType: string, count: number, today: number, ctx: ModifierContext) {
  let missedDays: number[] = [];
  if (packType === 'miss_out') {
    const { data: claims } = await svc.from('vault_collections').select('card_id').eq('owner_id', userId).like('card_id', 'card-%');
    const ownedDays = new Set(claims?.map((c: any) => parseInt(c.card_id.replace('card-', ''), 10)) || []);
    for (let i = 1; i <= today; i++) { if (!ownedDays.has(i)) missedDays.push(i); }
  }

  let echoChance = 15;
  let ultraRewardChance = 0.003;
  let adminConfig = null;
  try {
    const { data: config } = await svc.from('admin_config').select('config').eq('id', 1).single();
    if (config?.config) {
      adminConfig = config.config;
      if (config.config.echoSystem?.echoChance !== undefined) echoChance = config.config.echoSystem.echoChance;
      if (config.config.ultraRewardChance !== undefined) ultraRewardChance = config.config.ultraRewardChance;
    }
  } catch { /* use default */ }

  const days = drawCardDays(packType, count, today, missedDays);
  const cards = [];

  for (let cIdx = 0; cIdx < count; cIdx++) {
    let day = days[cIdx];

    // Echo pool draw
    if (packType !== 'free' && echoChance > 0 && Math.random() * 100 < echoChance) {
      const { data: echoPool } = await svc.from('echo_pool').select('*').limit(50);
      if (echoPool && echoPool.length > 0) {
        const echo = echoPool[Math.floor(Math.random() * echoPool.length)];
        await svc.from('echo_pool').delete().eq('id', echo.id);
        const echoRarity = echo.echo_rarity || 'common';
        const card_id_rarity = `${echo.source_day}-${echoRarity}`;
        const { data: supplyData } = await svc.rpc('increment_supply', { p_card_id_rarity: card_id_rarity });
        cards.push({
          owner_id: userId, card_id: `card-${echo.source_day}`, rarity: echoRarity,
          source: `pack_${packType}`, is_echo: true, echo_generation: echo.generation || 1,
          echo_source_day: echo.source_day, edition: supplyData || 1,
          max_supply: getSupplyCap(echoRarity, echo.source_day, today), proof: null, claimed_at: new Date().toISOString()
        });
        // Track echo pull
        await svc.from('profiles').update({
          echo_pulls_received: svc.rpc ? undefined : 0 // increment handled below
        }).eq('id', userId);
        await svc.rpc('increment_tokens', { user_uuid: userId, amount: 0 }); // no-op to ensure profile exists
        continue;
      }
    }

    // Normal roll with retry for fully minted-out days
    let rolledCard = null;
    let rollAttempts = 0;

    while (rollAttempts < 5) {
      let { rarity, proof } = getRarityRoll(packType, ctx, adminConfig);
      let max_supply = getSupplyCap(rarity, day, today);
      let card_id_rarity = `${day}-${rarity}`;
      let edition = 1;
      let downgradeAttempts = 0;
      let isSoldOut = false;

      while (downgradeAttempts < 5) {
        // Query current supply first to avoid wasting/incrementing a sold-out rarity
        const { data: supplyRow } = await svc.from('global_supply').select('supply').eq('card_id_rarity', card_id_rarity).maybeSingle();
        const currentSupply = supplyRow?.supply || 0;

        if (currentSupply < max_supply) {
          const { data } = await svc.rpc('increment_supply', { p_card_id_rarity: card_id_rarity });
          edition = data || 1;
          break;
        }

        const nextRarity = degradeRarity(rarity as Rarity, 1);
        if (nextRarity === rarity) {
          // At common floor and still sold out
          isSoldOut = true;
          break;
        }

        rarity = nextRarity;
        max_supply = getSupplyCap(rarity, day, today);
        card_id_rarity = `${day}-${rarity}`;
        downgradeAttempts++;
      }

      if (!isSoldOut) {
        let ultra_reward = null;
        if (Math.random() < ultraRewardChance) {
          ultra_reward = { type: 'custom_song', label: 'Custom Theme', description: 'You unlocked an ultra-rare secret theme!' };
        }
        rolledCard = {
          owner_id: userId, card_id: `card-${day}`, rarity, source: `pack_${packType}`,
          is_echo: false, echo_generation: 0, echo_source_day: null,
          edition, max_supply, proof, ultra_reward, claimed_at: new Date().toISOString()
        };
        break;
      }

      // If fully sold out for this day, draw a new random day and retry the roll
      day = drawCardDays(packType, 1, today, missedDays)[0];
      rollAttempts++;
    }

    // Fallback safety net
    if (!rolledCard) {
      const rarity: Rarity = 'common';
      const max_supply = getSupplyCap(rarity, day, today);
      const card_id_rarity = `${day}-${rarity}`;
      const { data } = await svc.rpc('increment_supply', { p_card_id_rarity: card_id_rarity });
      const edition = data || 1;
      rolledCard = {
        owner_id: userId, card_id: `card-${day}`, rarity, source: `pack_${packType}`,
        is_echo: false, echo_generation: 0, echo_source_day: null,
        edition, max_supply, proof: null, ultra_reward: null, claimed_at: new Date().toISOString()
      };
    }

    cards.push(rolledCard);
  }

  const { error } = await svc.from('vault_collections').insert(cards);
  if (error) throw new Error(`Database Insert Failed: ${error.message} - details: ${error.details}`);
  return cards;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, payload } = await req.json();
    const authHeader = req.headers.get('Authorization');
    const token = authHeader ? authHeader.replace('Bearer ', '') : undefined;

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_ANON_KEY') || '',
      { global: { headers: { Authorization: authHeader || '' } } }
    );
    const { data: { user }, error: authErr } = await supabaseClient.auth.getUser(token);

    // Allow invite code redemption without full auth (user may be mid-signup)
    if (action === 'redeemInviteCode') {
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!serviceKey) throw new Error('Missing service key');
      const svc = createClient(Deno.env.get('SUPABASE_URL') || '', serviceKey);
      const { code } = payload;
      const { data: valid } = await svc.rpc('redeem_invite_code', {
        p_code: (code || '').toUpperCase().trim(),
        p_user_id: user?.id || '00000000-0000-0000-0000-000000000000'
      });
      await logTelemetry(svc, 'invite_redeem', user?.id || null, { code, valid });
      return new Response(JSON.stringify({ success: !!valid, valid: !!valid }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Allow telemetry logging without full auth (e.g. for guest funnel tracking)
    if (action === 'logClientTelemetry') {
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!serviceKey) throw new Error('Missing service key');
      const svc = createClient(Deno.env.get('SUPABASE_URL') || '', serviceKey);
      const { eventType, payload: eventPayload } = payload;
      if (!eventType) throw new Error('Missing event type');
      await logTelemetry(svc, eventType, user?.id || null, eventPayload || {});
      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!user || authErr) {
      if (!authHeader) throw new Error('Not authenticated: Missing Authorization Header');
      throw new Error(`Not authenticated: ${authErr?.message || 'Invalid or Expired Token'}`);
    }

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceKey) throw new Error('Edge Function Error: SUPABASE_SERVICE_ROLE_KEY is missing');
    const svc = createClient(Deno.env.get('SUPABASE_URL') || '', serviceKey);

    // Ensure profile
    const { error: profileErr } = await svc.from('profiles')
      .insert({ id: user.id, wallet_address: user.user_metadata?.wallet_address || null })
      .select().maybeSingle();
    if (profileErr && !profileErr.message?.includes('duplicate') && !profileErr.code?.includes('23505')) {
      console.error('Profile guard failed:', profileErr.message);
    }

    const today = getCurrentDay();
    let adminConfig: any = null;
    try {
      const { data: cfgRow } = await svc.from('admin_config').select('config').eq('id', 1).single();
      if (cfgRow?.config) adminConfig = cfgRow.config;
    } catch {}

    switch (action) {

      // ═══════════════════════════════════════════════════════════
      // BURN CARD (V2: echo decay, anti-grind, bonus yield, telemetry)
      // ═══════════════════════════════════════════════════════════
      case 'burnCard': {
        const { cardOwnedId, sourceTitle, sourceMood, energy, valence, tempo } = payload;
        const { data: ownedCard, error: fetchErr } = await supabaseClient
          .from('vault_collections').select('*').eq('id', cardOwnedId).eq('owner_id', user.id).single();
        if (fetchErr || !ownedCard) throw new Error('Card not found or not owned');

        // Get profile for anti-grind tracking
        const { data: prof } = await svc.from('profiles').select('*').eq('id', user.id).single();
        let dailyBurns = (prof?.last_burn_day === today) ? (prof?.daily_burns || 0) : 0;

        // Calculate effective yield with echo bonus + anti-grind
        const tokensEarned = getEffectiveBurnYield(
          ownedCard.rarity as Rarity, !!ownedCard.is_echo, dailyBurns, adminConfig
        );

        await svc.rpc('increment_tokens', { user_uuid: user.id, amount: tokensEarned });

        // Echo spawn with generational decay
        const gen = ownedCard.echo_generation || 0;
        const spawnChance = getEchoSpawnChance(gen, adminConfig);
        const willEcho = spawnChance > 0 && (Math.random() * 100 < spawnChance);

        if (willEcho) {
          const echoDegradedRarity = degradeRarity(ownedCard.rarity as Rarity, 1);
          await svc.from('echo_pool').insert({
            source_card_id: ownedCard.card_id, generation: gen + 1,
            source_title: sourceTitle || 'Echo Card',
            source_day: parseInt(ownedCard.card_id.replace('card-', '')),
            source_mood: sourceMood || 'dark', source_rarity: ownedCard.rarity,
            echo_rarity: echoDegradedRarity, cover_url: '', audio_url: '',
            energy: energy || 0.5, valence: valence || 0.5, tempo: tempo || 120
          });
        }

        // Delete card & update profile counters
        await svc.from('vault_collections').delete().eq('id', cardOwnedId);
        dailyBurns += 1;
        await svc.from('profiles').update({
          daily_burns: dailyBurns,
          last_burn_day: today,
          total_burns: (prof?.total_burns || 0) + 1,
          tokens_earned_total: (prof?.tokens_earned_total || 0) + tokensEarned,
        }).eq('id', user.id);

        // Telemetry
        await logTelemetry(svc, 'card_burn', user.id, {
          rarity: ownedCard.rarity, isEcho: !!ownedCard.is_echo, gen,
          tokensEarned, willEcho, dailyBurns, spawnChance
        });

        return new Response(JSON.stringify({
          success: true, tokensEarned, willEcho, echoGen: gen + 1,
          dailyBurns, spawnChance
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ═══════════════════════════════════════════════════════════
      // DAILY DROP
      // ═══════════════════════════════════════════════════════════
      case 'claimDailyDrop': {
        const { day } = payload;
        if (Math.abs(day - today) > 1) throw new Error(`Day ${day} is too far from server day ${today}`);
        const claimDay = day;
        const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
        if (profile?.last_claim_day >= claimDay) throw new Error('Already claimed today');

        let rarityRoll = rollDailyClaimRarity(adminConfig);
        let max_supply = getSupplyCap(rarityRoll, claimDay, today);
        let card_id_rarity = `${claimDay}-${rarityRoll}`;
        let edition = 1;
        let downgradeAttempts = 0;

        while (downgradeAttempts < 5) {
          // Check current supply first
          const { data: supplyRow } = await svc.from('global_supply').select('supply').eq('card_id_rarity', card_id_rarity).maybeSingle();
          const currentSupply = supplyRow?.supply || 0;

          if (currentSupply < max_supply) {
            const { data } = await svc.rpc('increment_supply', { p_card_id_rarity: card_id_rarity });
            edition = data || 1;
            break;
          }

          const nextRarity = degradeRarity(rarityRoll as Rarity, 1);
          if (nextRarity === rarityRoll) {
            // common floor and still sold out, increment anyway
            const { data } = await svc.rpc('increment_supply', { p_card_id_rarity: card_id_rarity });
            edition = data || 1;
            break;
          }

          rarityRoll = nextRarity;
          max_supply = getSupplyCap(rarityRoll, claimDay, today);
          card_id_rarity = `${claimDay}-${rarityRoll}`;
          downgradeAttempts++;
        }

        const newCard = {
          owner_id: user.id, card_id: `card-${claimDay}`, rarity: rarityRoll,
          source: 'daily_claim', is_echo: false, edition,
          max_supply, claimed_at: new Date().toISOString()
        };
        const { error: insErr } = await svc.from('vault_collections').insert(newCard);
        if (insErr) throw new Error(`Failed to insert daily record: ${insErr.message}`);

        let newStreak = (profile?.streak_count || 0) + 1;
        if ((profile?.last_claim_day || 0) < claimDay - 1) newStreak = 1;
        await svc.from('profiles').update({ last_claim_day: claimDay, streak_count: newStreak }).eq('id', user.id);

        await logTelemetry(svc, 'daily_claim', user.id, { day: claimDay, rarity: rarityRoll });

        return new Response(JSON.stringify({ success: true, card: newCard }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ═══════════════════════════════════════════════════════════
      // PURCHASE PACK (V2: updated costs, limits, free pack = 1 card)
      // ═══════════════════════════════════════════════════════════
      case 'purchasePack': {
        const { packType, size, isGameplayReward } = payload;

        const TIER_COUNTS: Record<string, Record<string, number>> = {
          free:          { single: 1 },  // V2: reduced from 2 → 1
          taste:         { single: 2, triple: 5, bulk: 15 },
          light:         { single: 2, triple: 5, bulk: 15 },
          dark:          { single: 2, triple: 5, bulk: 15 },
          month:         { single: 2, triple: 5 },
          miss_out:      { single: 2, triple: 5 },
          special_picks: { single: 2, triple: 5 },
          prophecy:      { single: 1 },
          alpha:         { single: 1 },
          vault_token:   { single: 3 },
        };

        const tierMap = TIER_COUNTS[packType] || { single: 1 };
        let count = tierMap[size || 'single'] || tierMap['single'] || 1;
        let cost = 0;

        if (packType === 'vault_token') {
          cost = adminConfig?.tokenPackCost || TOKEN_PACK_COST;
          count = 3;
        } else if (RC1_TEST_MODE) {
          cost = 0; // All packs free in RC1
        }

        if (cost > 0) {
          try { await svc.rpc('decrement_tokens', { user_uuid: user.id, amount: cost }); }
          catch { throw new Error("Insufficient V⚡"); }
        }

        // vault_token is excluded — already gated by V⚡ token cost
        const PREMIUM_PACKS = ['prophecy', 'alpha', 'special_picks'];
        const isPremium = PREMIUM_PACKS.includes(packType);

        const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();

        // Free pack: enforce one per day
        if (packType === 'free') {
          const lastFreeDay = profile?.last_free_pack_day || 0;
          if (lastFreeDay >= today) {
            throw new Error('Free pack already claimed today. Come back tomorrow!');
          }
        }

        // Reset daily counters if new day
        let dailyStandard = (profile?.last_purchase_day === today) ? (profile?.daily_standard_purchased || 0) : 0;
        let dailyPremium  = (profile?.last_purchase_day === today) ? (profile?.daily_premium_purchased || 0) : 0;

        const stdLimit = adminConfig?.dailyStandardLimit || RC1_DAILY_STANDARD_LIMIT;
        const preLimit = adminConfig?.dailyPremiumLimit  || RC1_DAILY_PREMIUM_LIMIT;

        if (!isGameplayReward) {
          if (isPremium) {
            if (dailyPremium >= preLimit) {
              // Refund tokens if already charged
              if (cost > 0) {
                await svc.rpc('increment_tokens', { user_uuid: user.id, amount: cost });
              }
              throw new Error(`Daily premium limit reached (${preLimit}/day). Come back tomorrow.`);
            }
            dailyPremium += 1;
          } else {
            if (dailyStandard >= stdLimit) {
              throw new Error(`Daily standard limit reached (${stdLimit}/day). Come back tomorrow.`);
            }
            dailyStandard += 1;
          }
        }

        const { count: collSize } = await supabaseClient.from('vault_collections').select('*', { count: 'exact', head: true }).eq('owner_id', user.id);

        const now = new Date();
        const ctx: ModifierContext = {
          streak: profile?.streak_count || 0, collectionSize: collSize || 0,
          totalPulls: profile?.total_pulls || 0,
          pullsSinceRarePlus: profile?.pulls_since_rare_plus || 0,
          isFirstPack: (profile?.total_pulls || 0) === 0,
          currentHour: now.getUTCHours(), currentMinute: now.getUTCMinutes(),
          currentDayOfWeek: now.getUTCDay(), currentVaultDay: today,
        };

        const generatedCards = await generateCards(svc, user.id, packType, count, today, ctx);

        let newTotalPulls = (profile?.total_pulls || 0) + count;
        let newPullsSinceRarePlus = profile?.pulls_since_rare_plus || 0;
        let newPityCounter = profile?.pity_counter || 0;

        for (const card of generatedCards) {
          if (['rare', 'legendary', 'mythic'].includes(card.rarity)) {
            newPullsSinceRarePlus = 0;
            newPityCounter = 0;
          } else {
            newPullsSinceRarePlus++;
            newPityCounter++;
          }
        }

        const profileUpdate: Record<string, any> = {
          total_pulls: newTotalPulls, pulls_since_rare_plus: newPullsSinceRarePlus,
          pity_counter: newPityCounter,
          tokens_spent_total: cost > 0 ? (profile?.tokens_spent_total || 0) + cost : (profile?.tokens_spent_total || 0),
          daily_standard_purchased: dailyStandard,
          daily_premium_purchased: dailyPremium,
          last_purchase_day: today,
        };
        if (isGameplayReward) {
          profileUpdate.daily_standard_claims = profile?.daily_standard_claims || 0;
          profileUpdate.daily_premium_claims = profile?.daily_premium_claims || 0;
        }
        // Track free pack claim day
        if (packType === 'free') {
          profileUpdate.last_free_pack_day = today;
        }
        await svc.from('profiles').update(profileUpdate).eq('id', user.id);

        await logTelemetry(svc, 'pack_purchase', user.id, {
          packType, size, count, cost, rarities: generatedCards.map((c: any) => c.rarity)
        });

        return new Response(JSON.stringify({ success: true, cards: generatedCards }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ═══════════════════════════════════════════════════════════
      // TARGETED PULL (500 V⚡ — choose a specific day)
      // ═══════════════════════════════════════════════════════════
      case 'targetedPull': {
        const { day } = payload;
        if (!day || day < 1 || day > 365) throw new Error('Invalid day');
        const cost = adminConfig?.targetedPullCost || TARGETED_PULL_COST;
        try { await svc.rpc('decrement_tokens', { user_uuid: user.id, amount: cost }); }
        catch { throw new Error("Insufficient V⚡"); }

        const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
        const now = new Date();
        const ctx: ModifierContext = {
          streak: profile?.streak_count || 0, collectionSize: 0,
          totalPulls: profile?.total_pulls || 0,
          pullsSinceRarePlus: profile?.pulls_since_rare_plus || 0,
          isFirstPack: false, currentHour: now.getUTCHours(), currentMinute: now.getUTCMinutes(),
          currentDayOfWeek: now.getUTCDay(), currentVaultDay: today,
        };

        let { rarity, proof } = getRarityRoll('taste', ctx, adminConfig);
        let max_supply = getSupplyCap(rarity, day, today);
        let card_id_rarity = `${day}-${rarity}`;
        let edition = 1;
        let downgradeAttempts = 0;

        while (downgradeAttempts < 5) {
          // Check current supply first
          const { data: supplyRow } = await svc.from('global_supply').select('supply').eq('card_id_rarity', card_id_rarity).maybeSingle();
          const currentSupply = supplyRow?.supply || 0;

          if (currentSupply < max_supply) {
            const { data } = await svc.rpc('increment_supply', { p_card_id_rarity: card_id_rarity });
            edition = data || 1;
            break;
          }

          const nextRarity = degradeRarity(rarity as Rarity, 1);
          if (nextRarity === rarity) {
            // common floor and still sold out, increment anyway
            const { data } = await svc.rpc('increment_supply', { p_card_id_rarity: card_id_rarity });
            edition = data || 1;
            break;
          }

          rarity = nextRarity;
          max_supply = getSupplyCap(rarity, day, today);
          card_id_rarity = `${day}-${rarity}`;
          downgradeAttempts++;
        }

        const card = {
          owner_id: user.id, card_id: `card-${day}`, rarity, source: 'targeted_pull',
          is_echo: false, echo_generation: 0, echo_source_day: null,
          edition, max_supply, proof,
          claimed_at: new Date().toISOString()
        };
        await svc.from('vault_collections').insert(card);
        await logTelemetry(svc, 'targeted_pull', user.id, { day, rarity, cost });

        return new Response(JSON.stringify({ success: true, card }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ═══════════════════════════════════════════════════════════
      // RARITY UPGRADE (150 V⚡ — upgrade +1 tier, max legendary)
      // ═══════════════════════════════════════════════════════════
      case 'rarityUpgrade': {
        const { cardOwnedId } = payload;
        const { data: card, error: fetchErr } = await supabaseClient
          .from('vault_collections').select('*').eq('id', cardOwnedId).eq('owner_id', user.id).single();
        if (fetchErr || !card) throw new Error('Card not found or not owned');
        if (card.rarity === 'legendary' || card.rarity === 'mythic') throw new Error('Card already at max upgradeable tier');

        const cost = adminConfig?.rarityUpgradeCost || RARITY_UPGRADE_COST;
        try { await svc.rpc('decrement_tokens', { user_uuid: user.id, amount: cost }); }
        catch { throw new Error("Insufficient V⚡"); }

        const newRarity = upgradeRarity(card.rarity as Rarity);
        await svc.from('vault_collections').update({ rarity: newRarity }).eq('id', cardOwnedId);
        await logTelemetry(svc, 'rarity_upgrade', user.id, { cardId: card.card_id, from: card.rarity, to: newRarity, cost });

        return new Response(JSON.stringify({ success: true, oldRarity: card.rarity, newRarity }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ═══════════════════════════════════════════════════════════
      // DUPLICATE FUSION (3 identical → 1 upgraded)
      // ═══════════════════════════════════════════════════════════
      case 'duplicateFusion': {
        const { cardIds } = payload;
        if (!cardIds || cardIds.length !== 3) throw new Error('Must provide exactly 3 card IDs');

        const { data: cards, error: fetchErr } = await supabaseClient
          .from('vault_collections').select('*').in('id', cardIds).eq('owner_id', user.id);
        if (fetchErr || !cards || cards.length !== 3) throw new Error('Cards not found or not owned');

        // Verify all same card_id and rarity
        const baseCardId = cards[0].card_id;
        const baseRarity = cards[0].rarity;
        if (!cards.every((c: any) => c.card_id === baseCardId && c.rarity === baseRarity)) {
          throw new Error('All 3 cards must be identical (same day + rarity)');
        }

        // Delete the 3 cards
        await svc.from('vault_collections').delete().in('id', cardIds);

        // Create 1 upgraded card
        const newRarity = upgradeRarity(baseRarity as Rarity);
        const day = parseInt(baseCardId.replace('card-', ''));
        const card_id_rarity = `${day}-${newRarity}`;
        const { data: supplyData } = await svc.rpc('increment_supply', { p_card_id_rarity: card_id_rarity });

        const fusedCard = {
          owner_id: user.id, card_id: baseCardId, rarity: newRarity, source: 'fusion',
          is_echo: false, echo_generation: 0, echo_source_day: null,
          edition: supplyData || 1, max_supply: getSupplyCap(newRarity, day, today),
          claimed_at: new Date().toISOString()
        };
        await svc.from('vault_collections').insert(fusedCard);
        await logTelemetry(svc, 'duplicate_fusion', user.id, { baseCardId, from: baseRarity, to: newRarity });

        return new Response(JSON.stringify({ success: true, fusedCard }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ═══════════════════════════════════════════════════════════
      // NFT MINT (RC1 production simulation)
      // ═══════════════════════════════════════════════════════════
      case 'requestNftMint': {
        const { cardOwnedId } = payload;
        if (!cardOwnedId) throw new Error('Card ID is required');

        // 1. Fetch card and verify ownership
        const { data: card, error: cardErr } = await supabaseClient
          .from('vault_collections')
          .select('*')
          .eq('id', cardOwnedId)
          .eq('owner_id', user.id)
          .single();
        if (cardErr || !card) throw new Error('Card not found or not owned');

        // 2. Verify blockchain status
        if (card.blockchain_status === 'minted' || card.blockchain_status === 'pending') {
          throw new Error('Card is already minted or pending');
        }

        const rarity = card.rarity as Rarity;

        // 3. Verify card is mintable
        const maxMintable = MINTABLE_CAPS[rarity] ?? 0;
        if (maxMintable <= 0) {
          throw new Error(`${rarity.toUpperCase()} cards are not mintable`);
        }

        // 4. Verify global mint limit has not been exceeded
        const { count: mintedCount, error: countErr } = await svc
          .from('vault_collections')
          .select('*', { count: 'exact', head: true })
          .eq('card_id', card.card_id)
          .eq('rarity', card.rarity)
          .in('blockchain_status', ['minted', 'pending']);
        if (countErr) throw new Error(`Verification error: ${countErr.message}`);
        
        if (mintedCount !== null && mintedCount >= maxMintable) {
          throw new Error(`Max mint limit of ${maxMintable} copies reached for this card`);
        }

        // 5. Check user tokens
        const mintCost = NFT_MINT_COSTS[rarity] ?? 0;
        const { data: profile } = await svc.from('profiles').select('tokens').eq('id', user.id).single();
        if (!profile || (profile.tokens ?? 0) < mintCost) {
          throw new Error('Insufficient V⚡');
        }

        // 6. Deduct tokens
        if (mintCost > 0) {
          try {
            await svc.rpc('decrement_tokens', { user_uuid: user.id, amount: mintCost });
          } catch {
            throw new Error('Insufficient V⚡');
          }
        }

        // 7. Generate mock Base mainnet TX hash
        const txHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

        // 8. Update database record
        const { error: updateErr } = await svc
          .from('vault_collections')
          .update({
            blockchain_status: 'minted',
            fingerprint: txHash
          })
          .eq('id', cardOwnedId);
        if (updateErr) {
          // Refund tokens on failure
          if (mintCost > 0) {
            await svc.rpc('increment_tokens', { user_uuid: user.id, amount: mintCost });
          }
          throw new Error(`Minting failed: ${updateErr.message}`);
        }

        // 9. Telemetry
        await logTelemetry(svc, 'nft_mint', user.id, {
          cardId: card.card_id,
          rarity: card.rarity,
          cost: mintCost,
          txHash
        });

        return new Response(JSON.stringify({ success: true, txHash }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ═══════════════════════════════════════════════════════════
      // PLAYER DEBUG STATS (RC1)
      // ═══════════════════════════════════════════════════════════
      case 'getDebugStats': {
        const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
        const { data: cards } = await supabaseClient.from('vault_collections').select('rarity, is_echo, echo_generation').eq('owner_id', user.id);

        const rarityDist: Record<string, number> = {};
        let echoCount = 0;
        for (const c of (cards || [])) {
          rarityDist[c.rarity] = (rarityDist[c.rarity] || 0) + 1;
          if (c.is_echo) echoCount++;
        }

        return new Response(JSON.stringify({
          success: true,
          stats: {
            cardsOwned: cards?.length || 0, rarityDist, echoCount,
            tokens: profile?.tokens || 0,
            tokensEarned: profile?.tokens_earned_total || 0,
            tokensSpent: profile?.tokens_spent_total || 0,
            totalBurns: profile?.total_burns || 0,
            echoPullsReceived: profile?.echo_pulls_received || 0,
            dailyBurns: profile?.daily_burns || 0,
            pityCounter: profile?.pity_counter || 0,
            streak: profile?.streak_count || 0,
            totalPulls: profile?.total_pulls || 0,
          }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'updateAdminConfig': {
        const { config, passphrase } = payload;
        if (passphrase !== 'th3scr1b3') throw new Error("Unauthorized");
        const { error } = await svc.from('admin_config').upsert({ id: 1, config, updated_at: new Date().toISOString() });
        if (error) throw new Error(error.message);
        return new Response(JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }



      case 'payVoyeurFee': {
        const { amount } = payload;
        if (!amount || amount <= 0) throw new Error("Invalid amount");
        try { await svc.rpc('decrement_tokens', { user_uuid: user.id, amount }); }
        catch { throw new Error("Insufficient V⚡"); }
        return new Response(JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      default:
        throw new Error('Unknown action');
    }
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
