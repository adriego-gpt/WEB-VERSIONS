import React from 'react';
import { Star, BadgeCheck, Quote, MessageSquareHeart, Sparkles } from 'lucide-react';
import { motion as Motion } from 'framer-motion';

const testimonials = [
  {
    id: 1,
    name: 'Valentina M.',
    location: 'Medellín',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80',
    rating: 5,
    quote: 'La calidad del lino y los acabados superaron todas mis expectativas. El pedido por WhatsApp fue súper ágil y la asesoría de talla impecable.',
    itemPurchased: 'Camisa Lino Premium',
    verifiedPurchase: true
  },
  {
    id: 2,
    name: 'Camila R.',
    location: 'Bogotá',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80',
    rating: 5,
    quote: 'El corte del blazer es perfecto. Me ayudaron a elegir la talla en tiempo real por chat y la caída de la prenda es de alta costura.',
    itemPurchased: 'Blazer Oversize Noir',
    verifiedPurchase: true
  },
  {
    id: 3,
    name: 'Sofía L.',
    location: 'Cali',
    avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80',
    rating: 5,
    quote: 'Prendas con una caída hermosa, telas frescas y empaque impecable. Ya es mi tercera compra y la atención siempre es personalizada.',
    itemPurchased: 'Vestido Seda Natural',
    verifiedPurchase: true
  }
];

const CommunityReviewsSection = () => {
  return (
    <section className="community-reviews-section section-shell" aria-labelledby="reviews-title">
      <div className="container">
        <div className="reviews-header">
          <h2 id="reviews-title" className="reviews-title">
            Voces de Nuestra Comunidad <Sparkles className="icon-sparkles" size={24} />
          </h2>
          <p className="reviews-subtitle">Testimonios y Reseñas ⭐⭐⭐⭐⭐</p>
          
          <div className="reviews-stats-pill">
            <Star className="icon-star-filled" size={16} fill="currentColor" />
            <span>4.9/5 Calificación promedio · +500 pedidos entregados</span>
          </div>
        </div>

        <div className="reviews-grid">
          {testimonials.map((testimonial, index) => (
            <Motion.article 
              key={testimonial.id}
              className="review-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
            >
              <div className="review-card-header">
                <img src={testimonial.avatar} alt={testimonial.name} className="review-avatar" loading="lazy" />
                <div className="review-user-info">
                  <h3>{testimonial.name}</h3>
                  <span className="review-location">{testimonial.location}</span>
                </div>
              </div>
              
              <div className="review-rating">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="icon-star-filled" size={16} fill="currentColor" />
                ))}
                {testimonial.verifiedPurchase && (
                  <span className="verified-badge">
                    <BadgeCheck size={14} /> Compra Verificada
                  </span>
                )}
              </div>

              <blockquote className="review-quote">
                <Quote className="quote-icon" size={24} />
                <p>"{testimonial.quote}"</p>
              </blockquote>

              <div className="review-item-purchased">
                <span>Prenda: {testimonial.itemPurchased}</span>
              </div>
            </Motion.article>
          ))}
        </div>

        <div className="reviews-footer">
          <a href="https://wa.me/123456789" className="reviews-cta-button" target="_blank" rel="noopener noreferrer">
            <MessageSquareHeart size={20} />
            ¿Dudas con tu look? Escríbenos
          </a>
        </div>
      </div>
    </section>
  );
};

export default CommunityReviewsSection;
