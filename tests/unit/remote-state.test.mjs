import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUserStateSignature,
  hydrateRemoteUserState
} from '../../src/domain/user/remoteState.js';
import { FALLBACK_IMAGE } from '../../src/constants/product.js';

// Standard normalizers matching the domain contract
const normalizeCart = (cart = []) =>
  (Array.isArray(cart) ? cart : []).map((item) => ({
    key: String(item.key || `${item.id}-${item.color}-${item.size}`),
    id: String(item.id || '').trim(),
    color: String(item.color || '').trim(),
    size: String(item.size || '').trim(),
    quantity: Math.max(1, Number(item.quantity) || 1),
  }));

const normalizeFavorites = (favs = []) =>
  Array.from(
    new Set(
      (Array.isArray(favs) ? favs : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )
  );

const getImageForProduct = (product, color) => {
  if (!product) return '';
  if (color && product.colorImages?.[color]) return product.colorImages[color];
  return product.image || '';
};

describe('Remote User State Domain (src/domain/user/remoteState.js)', () => {
  const baseProduct1 = {
    id: 'prod_1',
    name: 'Camisa Lino Premium',
    price: 55,
    image: 'https://images.unsplash.com/photo-camisa-1',
    isPublic: true
  };

  const baseProduct2 = {
    id: 'prod_2',
    name: 'Pantalón Chino Beige',
    price: 45,
    image: 'https://images.unsplash.com/photo-pantalon-1',
    isPublic: true
  };

  const hiddenProduct = {
    id: 'prod_hidden',
    name: 'Prenda Oculta Descontinuada',
    price: 30,
    image: 'https://images.unsplash.com/photo-hidden',
    isPublic: false
  };

  const sampleProducts = [baseProduct1, baseProduct2, hiddenProduct];

  test('1. State signature is stable and identical for equivalent cart and favorites', () => {
    const cartA = [
      { id: 'prod_1', color: 'Blanco', size: 'M', quantity: 2, key: 'prod_1-Blanco-M' }
    ];
    const cartB = [
      { id: 'prod_1', color: 'Blanco', size: 'M', quantity: 2, key: 'prod_1-Blanco-M' }
    ];
    const favoritesA = ['prod_1', 'prod_2'];
    const favoritesB = ['prod_1', 'prod_2'];

    const sigA = buildUserStateSignature(cartA, favoritesA, { normalizeCart, normalizeFavorites });
    const sigB = buildUserStateSignature(cartB, favoritesB, { normalizeCart, normalizeFavorites });

    assert.equal(typeof sigA, 'string');
    assert.equal(sigA, sigB);
    assert.deepEqual(JSON.parse(sigA), {
      cart: [{ key: 'prod_1-Blanco-M', id: 'prod_1', color: 'Blanco', size: 'M', quantity: 2 }],
      favorites: ['prod_1', 'prod_2']
    });
  });

  test('2. Quantity, variant or favorite changes alter the signature', () => {
    const baseCart = [{ id: 'prod_1', color: 'Blanco', size: 'M', quantity: 1, key: 'prod_1-Blanco-M' }];
    const baseFavs = ['prod_1'];
    const baseSig = buildUserStateSignature(baseCart, baseFavs, { normalizeCart, normalizeFavorites });

    // Changing quantity
    const changedQtyCart = [{ id: 'prod_1', color: 'Blanco', size: 'M', quantity: 2, key: 'prod_1-Blanco-M' }];
    const sigQty = buildUserStateSignature(changedQtyCart, baseFavs, { normalizeCart, normalizeFavorites });
    assert.notEqual(sigQty, baseSig);

    // Changing variant (size)
    const changedVariantCart = [{ id: 'prod_1', color: 'Blanco', size: 'L', quantity: 1, key: 'prod_1-Blanco-L' }];
    const sigVariant = buildUserStateSignature(changedVariantCart, baseFavs, { normalizeCart, normalizeFavorites });
    assert.notEqual(sigVariant, baseSig);

    // Changing favorites
    const changedFavs = ['prod_1', 'prod_2'];
    const sigFavs = buildUserStateSignature(baseCart, changedFavs, { normalizeCart, normalizeFavorites });
    assert.notEqual(sigFavs, baseSig);
  });

  test('3. Remote hydration preserves only existing and public products', () => {
    const remoteCart = [
      { id: 'prod_1', color: 'Blanco', size: 'M', quantity: 1, key: 'k1' },
      { id: 'prod_hidden', color: 'Negro', size: 'S', quantity: 1, key: 'k2' },
      { id: 'prod_nonexistent', color: 'Azul', size: 'L', quantity: 1, key: 'k3' }
    ];
    const remoteFavorites = ['prod_1', 'prod_hidden', 'prod_nonexistent', 'prod_2'];

    const { cart, favorites } = hydrateRemoteUserState({
      remoteCart,
      remoteFavorites,
      localCart: [],
      products: sampleProducts,
      getImageForProduct,
      normalizeCart,
      normalizeFavorites
    });

    // Only prod_1 is public and exists in products
    assert.equal(cart.length, 1);
    assert.equal(cart[0].id, 'prod_1');

    // Only prod_1 and prod_2 are public and exist in products
    assert.deepEqual(favorites, ['prod_1', 'prod_2']);
  });

  test('4. Hydrated cart lines receive fresh catalog name, price and image', () => {
    const remoteCart = [
      {
        id: 'prod_1',
        name: 'Old Stale Name',
        price: 10,
        image: 'https://old-broken-image.jpg',
        color: 'Blanco',
        size: 'M',
        quantity: 2,
        key: 'prod_1-Blanco-M'
      }
    ];

    const { cart } = hydrateRemoteUserState({
      remoteCart,
      remoteFavorites: [],
      localCart: [],
      products: [baseProduct1],
      getImageForProduct,
      normalizeCart,
      normalizeFavorites
    });

    assert.equal(cart.length, 1);
    const line = cart[0];
    assert.equal(line.name, 'Camisa Lino Premium');
    assert.equal(line.price, 55);
    assert.equal(line.image, 'https://images.unsplash.com/photo-camisa-1');
    assert.equal(line.quantity, 2);
  });

  test('5. Favorites of non-existent or hidden products are discarded', () => {
    const remoteFavorites = ['prod_hidden', 'ghost_id_404', 'prod_2'];

    const { favorites } = hydrateRemoteUserState({
      remoteCart: [],
      remoteFavorites,
      localCart: [],
      products: sampleProducts,
      getImageForProduct,
      normalizeCart,
      normalizeFavorites
    });

    assert.deepEqual(favorites, ['prod_2']);
  });

  test('6. Uses FALLBACK_IMAGE when product has no valid image', () => {
    const productWithoutImage = {
      id: 'prod_no_img',
      name: 'Bermuda Sin Foto',
      price: 25,
      image: '',
      isPublic: true
    };

    const remoteCart = [
      { id: 'prod_no_img', color: 'Gris', size: '32', quantity: 1, key: 'prod_no_img-Gris-32' }
    ];

    const { cart } = hydrateRemoteUserState({
      remoteCart,
      remoteFavorites: [],
      localCart: [],
      products: [productWithoutImage],
      getImageForProduct,
      normalizeCart,
      normalizeFavorites
    });

    assert.equal(cart.length, 1);
    assert.equal(cart[0].image, FALLBACK_IMAGE);
  });

  test('7. Does not mutate input arrays or objects (Immutable execution)', () => {
    const frozenCartItem = Object.freeze({
      id: 'prod_1',
      color: 'Blanco',
      size: 'M',
      quantity: 1,
      key: 'prod_1-Blanco-M'
    });
    const frozenRemoteCart = Object.freeze([frozenCartItem]);
    const frozenRemoteFavorites = Object.freeze(['prod_1', 'prod_2']);
    const frozenLocalCart = Object.freeze([]);
    const frozenProducts = Object.freeze([
      Object.freeze({ ...baseProduct1 }),
      Object.freeze({ ...baseProduct2 })
    ]);

    // Must execute cleanly without throwing mutation errors
    const result = hydrateRemoteUserState({
      remoteCart: frozenRemoteCart,
      remoteFavorites: frozenRemoteFavorites,
      localCart: frozenLocalCart,
      products: frozenProducts,
      getImageForProduct,
      normalizeCart,
      normalizeFavorites
    });

    assert.equal(result.cart.length, 1);
    assert.equal(result.favorites.length, 2);

    // Verify input structures were untouched
    assert.equal(frozenRemoteCart.length, 1);
    assert.equal(frozenRemoteFavorites.length, 2);
  });

  test('8. Guest cart survives login or account creation when the remote account is empty', () => {
    const guestCart = [
      {
        id: 'prod_1',
        color: 'Blanco',
        size: 'M',
        quantity: 2,
        key: 'prod_1-Blanco-M'
      }
    ];

    const { cart } = hydrateRemoteUserState({
      remoteCart: [],
      remoteFavorites: [],
      localCart: guestCart,
      localFavorites: [],
      mergeLocalState: true,
      products: sampleProducts,
      getImageForProduct,
      normalizeCart,
      normalizeFavorites
    });

    assert.equal(cart.length, 1);
    assert.equal(cart[0].id, 'prod_1');
    assert.equal(cart[0].quantity, 2);
  });

  test('9. Authentication merges remote and guest state without duplicating variants', () => {
    const remoteCart = [
      { id: 'prod_1', color: 'Blanco', size: 'M', quantity: 2, key: 'prod_1-Blanco-M' }
    ];
    const guestCart = [
      { id: 'prod_1', color: 'Blanco', size: 'M', quantity: 1, key: 'prod_1-Blanco-M' },
      { id: 'prod_2', color: 'Beige', size: 'L', quantity: 1, key: 'prod_2-Beige-L' }
    ];

    const mergedOnce = hydrateRemoteUserState({
      remoteCart,
      remoteFavorites: ['prod_1'],
      localCart: guestCart,
      localFavorites: ['prod_2'],
      mergeLocalState: true,
      products: sampleProducts,
      getImageForProduct,
      normalizeCart,
      normalizeFavorites
    });
    const mergedTwice = hydrateRemoteUserState({
      remoteCart: mergedOnce.cart,
      remoteFavorites: mergedOnce.favorites,
      localCart: guestCart,
      localFavorites: ['prod_2'],
      mergeLocalState: true,
      products: sampleProducts,
      getImageForProduct,
      normalizeCart,
      normalizeFavorites
    });

    assert.deepEqual(
      mergedOnce.cart.map(({ id, quantity }) => ({ id, quantity })),
      [{ id: 'prod_1', quantity: 2 }, { id: 'prod_2', quantity: 1 }]
    );
    assert.deepEqual(mergedOnce.favorites, ['prod_1', 'prod_2']);
    assert.deepEqual(mergedTwice, mergedOnce, 'repetir la hidratación no debe duplicar ni aumentar cantidades');
  });
});
