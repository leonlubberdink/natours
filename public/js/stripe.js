import axios from 'axios';
import { showAlert } from './alerts';

const stripe = Stripe(
  'pk_test_51NGHKyCVAV05xafF80U9MDmOjAuxnJ05sAHjcs1fz5vm5yazqnmCbGFJImAQ75Yvi3B2TSJG939KuDfvHeUmLB4m00gyUYZx51'
);

export const bookTour = async (tourId) => {
  try {
    // 1) Get checout seesion from APIFeatures

    const session = await axios(
      `http://localhost:8000/api/v1/bookings/checkout-session/${tourId}`
    );

    // 2) Create checkout form + charge creditcard
    await stripe.redirectToCheckout({
      sessionId: session.data.session.id,
    });
  } catch (err) {
    showAlert('error', err);
  }
};
