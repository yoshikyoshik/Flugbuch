const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Admin-Client initialisieren (darf User schreiben)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // --- EVENT HANDLER ---
  
  // 1. Abo erfolgreich abgeschlossen (oder Rechnung bezahlt)
  // Wir schauen auf 'invoice.payment_succeeded', da dies auch bei Verlängerungen feuert
  if (stripeEvent.type === 'invoice.payment_succeeded') {
    const invoice = stripeEvent.data.object;
    const subscriptionId = invoice.subscription;
    
    // Details zum Abo holen (vor allem: Wann endet der Zeitraum?)
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const periodEnd = subscription.current_period_end; // Unix Timestamp
    const customerId = subscription.customer;

    // Wir brauchen die UserID. 
    // Bei Erstkauf steht sie in subscription.metadata (wenn wir sie in create-checkout gesetzt haben).
    // Aber wir suchen den User am besten über die customer_id in Supabase, 
    // falls wir sie schon gespeichert haben.
    
    // Fall A: Wir müssen den User finden.
    // Strategie: Wir durchsuchen Supabase nach der User-ID, die wir beim Checkout übergeben haben.
    // Hinweis: 'client_reference_id' ist im 'checkout.session.completed' Event verfügbar, 
    // aber bei Verlängerungen ('invoice.payment_succeeded') oft schwerer zu finden.
    
    // Besserer Weg für den Start: Wir hören auf 'checkout.session.completed' für den Erstkauf
    // und 'invoice.payment_succeeded' für Verlängerungen.
  }

  // Vereinfachte Logik für den Anfang: 'checkout.session.completed'
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const userId = session.client_reference_id;
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    // Abo-Details holen für das Enddatum
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const periodEnd = subscription.current_period_end;

    console.log(`Zahlung erfolgreich für User ${userId}. Setze PRO bis ${periodEnd}`);

    // Update Supabase
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        subscription_status: 'pro',
        subscription_end: periodEnd,
        stripe_customer_id: customerId, // Wichtig für das Kundenportal später!
        stripe_subscription_id: subscriptionId
      }
    });

    if (error) console.error('Supabase Update Error:', error);
  }

  // Logik für Verlängerung / Kündigung
  if (stripeEvent.type === 'customer.subscription.updated') {
    const subscription = stripeEvent.data.object;
    // Wir müssen den User anhand der stripe_customer_id finden? 
    // Supabase Admin API hat kein "Find User by Metadata".
    // Workaround: Wir verlassen uns darauf, dass der User eingeloggt ist und statusUpdate zieht?
    // Nein, das Backend muss es tun.
    
    // PRO-TIPP: Da wir hier keine Datenbank haben, um stripe_customer_id -> user_id aufzulösen,
    // ist es am einfachsten, beim Checkout die user_id in die Subscription Metadata zu schreiben.
    // Das haben wir in create-checkout.js getan!
    
    const userId = subscription.metadata.supabase_user_id; 
    const periodEnd = subscription.current_period_end;
    const status = subscription.status; // active, past_due, canceled...

    if (userId) {
       // Wenn gekündigt oder abgelaufen, bleibt der Status "pro", aber das Enddatum läuft aus.
       // Nur wenn "status" wirklich invalide ist (z.B. unpaid), könnten wir eingreifen.
       // Aber unsere App-Logik basiert rein auf 'subscription_end', also aktualisieren wir das einfach.
       
       await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            subscription_end: periodEnd,
            // subscription_status lassen wir auf 'pro', da die Zeit entscheidet.
          }
       });
       console.log(`Abo Update für User ${userId}: Ende jetzt ${periodEnd}`);
    }
  }

  if (stripeEvent.type === 'customer.subscription.deleted') {
      const subscription = stripeEvent.data.object;
      const userId = subscription.metadata.supabase_user_id;
      
      if (userId) {
          console.log(`Abo gelöscht für User ${userId}. Downgrade.`);
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            user_metadata: {
                subscription_status: 'free',
                subscription_end: null 
            }
         });
      }
  }

  return { statusCode: 200, body: 'Received' };
};