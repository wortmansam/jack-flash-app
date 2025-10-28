import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ShoppingCart, MapPin, Gift, Bell, Home, Search, Star, CreditCard, Shield } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

const getImageUrl = (bucket, path) => {
  if (!path) return null;
  
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);
  
  return data?.publicUrl || null;
};

const ProductImage = ({ imageUrl, fallbackEmoji, alt, className = "w-full h-full object-cover" }) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  
  if (!imageUrl || hasError) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <span className="text-4xl">{fallbackEmoji || '🛒'}</span>
      </div>
    );
  }
  
  return (
    <>
      {!isLoaded && (
        <div className="absolute inset-0 animate-pulse bg-gray-200 rounded" />
      )}
      <img 
        src={imageUrl}
        alt={alt || 'Product image'}
        loading="lazy"
        className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
      />
    </>
  );
};

const ProductImageDisplay = ({ product, size = 'medium', category }) => {
  const imageUrl = getImageUrl('product-images', product.image_url);
  const fallbackEmoji = product.picture || category?.icon || '🛒';
  
  const sizeClasses = {
    small: 'w-16 h-16',
    medium: 'w-20 h-20',
    large: 'w-32 h-32',
    card: 'w-full h-40'
  };
  
  return (
    <div className={`${sizeClasses[size]} rounded-xl overflow-hidden bg-slate-700 bg-opacity-30 relative flex-shrink-0 flex items-center justify-center p-2`}>
      <ProductImage
        imageUrl={imageUrl}
        fallbackEmoji={fallbackEmoji}
        alt={product.name}
        className="w-full h-full object-contain"
      />
    </div>
  );
};
const CategoryIcon = ({ category, size = "w-12 h-12" }) => {
  const imageUrl = getImageUrl('category-images', category.image_url);
  
  if (imageUrl) {
    return (
      <div className={`${size} rounded-lg overflow-hidden bg-gray-100 relative`}>
        <ProductImage
          imageUrl={imageUrl}
          fallbackEmoji={category.icon}
          alt={category.name}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }
  
  return <span className="text-2xl">{category.icon}</span>;
};

const JackFlashLogo = ({ size = 'large' }) => {
  const sizes = {
    large: 'h-16',
    medium: 'h-12',
    small: 'h-8'
  };
  
  return (
    <img 
      src="https://d1jxr8mzr163g2.cloudfront.net/9e63cfaa-62e4-45ae-a124-184a8f0eb00b/77111b2d-5af1-4ede-ac57-dabfd0ab4008.png"
      alt="Jack Flash"
      className={sizes[size]}
      style={{ display: 'block', margin: '0 auto' }}
    />
  );
};
const GasStationApp = () => {
  window.supabase = supabase;
  const [currentScreen, setCurrentScreen] = useState('home');
  const [cart, setCart] = useState([]);
  const [loyaltyPoints, setLoyaltyPoints] = useState(2450);
  const [selectedStore, setSelectedStore] = useState(null);
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryCounts, setCategoryCounts] = useState({});
  const [user, setUser] = useState(null);
  const [authScreen, setAuthScreen] = useState('signin'); // 'signin' or 'signup'
  const [activeOrder, setActiveOrder] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isLoadingRole, setIsLoadingRole] = useState(true);
  const [trackingOrderId, setTrackingOrderId] = useState(null);

  // Check if user is already logged in
useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      
      // Reset all state when user changes
      if (!session?.user) {
        setCurrentScreen('home');
        setSelectedStore(null);
        setCart([]);
        setActiveOrder(null);
        setUserRole(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

useEffect(() => {
  if (!user) {
    setActiveOrder(null);
    return;
  }

const fetchActiveOrder = async () => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        store:stores(id, name, address)
      `)
      .eq('user_id', user.id)
      .in('status', ['placed', 'preparing', 'ready'])
      .order('created_at', { ascending: false })
      .limit(1);  // Remove .single() - just use .limit(1)

    if (error) {
      console.error('Error fetching active order:', error);
      setActiveOrder(null);
    } else if (data && data.length > 0) {
      // data is now an array, so take the first item
      const order = data[0];
      // Parse items if they're stored as JSON string
      order.items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
      console.log('Active order found:', order);
      setActiveOrder(order);
    } else {
      console.log('No active orders found');
      setActiveOrder(null);
    }
  } catch (err) {
    console.error('Exception fetching active order:', err);
    setActiveOrder(null);
  }
};

  // Fetch immediately when user logs in
  fetchActiveOrder();

  // Subscribe to order updates for this user
  const channel = supabase
    .channel('order-updates')
    .on('postgres_changes', 
      { 
        event: '*',  // Listen to all events (INSERT, UPDATE, DELETE)
        schema: 'public', 
        table: 'orders',
        filter: `user_id=eq.${user.id}`
      }, 
      (payload) => {
        console.log('Order update received:', payload);
        const order = payload.new;
        
        // If order is in active status, update activeOrder
        if (['placed', 'preparing', 'ready'].includes(order.status)) {
          order.items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
          setActiveOrder(order);
        } else {
          // If order status changed to completed/cancelled, clear active order
          setActiveOrder(null);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [user?.id]);

useEffect(() => {
  const checkUserRole = async () => {
    if (!user) {
      setIsLoadingRole(false);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    setUserRole(profile?.role || 'customer');
    setIsLoadingRole(false);
  };

  checkUserRole();
}, [user?.id]);

useEffect(() => {
  const fetchStores = async () => {
    const { data, error } = await supabase
      .from('stores')
      .select('*');
    
    if (error) {
      console.error('Error fetching stores:', error);
      return;
    }
    
    // For each store, fetch its categories based on products
    const storesWithCategories = await Promise.all(data.map(async (store) => {
      // Get products at this store
      const { data: storeProducts } = await supabase
        .from('store_products')
        .select('product_id')
        .eq('store_id', store.id);
      
      if (!storeProducts || storeProducts.length === 0) {
        return { ...store, store_categories: [] };
      }
      
      const productIds = storeProducts.map(sp => sp.product_id);
      
      // Get categories from products
      const { data: products } = await supabase
        .from('products')
        .select('categories')
        .in('id', productIds);
      
      if (!products) {
        return { ...store, store_categories: [] };
      }
      
      // Get unique category IDs
      const uniqueCategoryIds = [...new Set(products.map(p => p.categories).filter(c => c !== null))];
      
      // Fetch category details
      const { data: categoryDetails } = await supabase
        .from('categories')
        .select('id, name, icon, restricted')
        .in('id', uniqueCategoryIds);
      
      // Format to match existing structure
      const formattedCategories = (categoryDetails || []).map(cat => ({
        categories: cat
      }));
      
      return { ...store, store_categories: formattedCategories };
    }));
    
    setStores(storesWithCategories);
    
    const lats = storesWithCategories.map(s => s.lat).filter(l => l !== null);
    const lngs = storesWithCategories.map(s => s.lng).filter(l => l !== null);
    if (lats.length > 0 && lngs.length > 0) {
      const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length;
      const avgLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
      setMapCenter({ lat: avgLat, lng: avgLng });
    }
  };

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('display_order', { ascending: true });
    if (error) {
      console.error('Error fetching categories:', error);
    } else {
      setCategories(data || []);
    }
  };

  fetchStores();
  fetchCategories();
}, []);

  useEffect(() => {
  const fetchCategoryCounts = async () => {
    if (selectedStore) {
      // Get all products available at this store
       const { data: storeProducts, error: spError } = await supabase
        .from('store_products')
        .select('product_id')
        .eq('store_id', selectedStore.id);
      
      if (spError || !storeProducts) {
        console.error('Error fetching store products:', spError);
        return;
      }
      
      const productIds = storeProducts.map(sp => sp.product_id);
      
      if (productIds.length === 0) {
        setCategoryCounts({});
        return;
      }
      
      // Get products with their categories
      const { data: productData, error: prodError } = await supabase
        .from('products')
        .select('id, categories')
        .in('id', productIds);
      
      if (!prodError && productData) {
        const counts = {};
        productData.forEach(product => {
          if (product.categories) {
            counts[product.categories] = (counts[product.categories] || 0) + 1;
          }
        });
        console.log('Category counts:', counts);
        setCategoryCounts(counts);
      }
    }
  };

  fetchCategoryCounts();
}, [selectedStore]);

const handleConfirmOrder = async (orderDetails) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('Please sign in');
      return;
    }

    // Fetch default payment method
    const { data: paymentMethods } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .single();

    if (!paymentMethods) {
      alert('Please add a default payment method in Account');
      return;
    }

    // Prepare order data for email
    const orderData = {
      items: cart.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity
      })),
      storeName: selectedStore.name,
      storeAddress: selectedStore.address,
      pickupTime: orderDetails.pickupTime,
      specialInstructions: orderDetails.specialInstructions,
      subtotal: getSubtotal(),
      discounts: getTotalDiscounts(),
      tax: getTax(),
      total: getTotal()
    };

const response = await fetch(process.env.REACT_APP_EDGE_FUNCTION_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`
  },
  body: JSON.stringify({
    amount: getTotal(),
    paymentMethodId: orderDetails.paymentMethodId,
    userId: user.id,
    userEmail: user.email,
    orderData: orderData  // NEW: This passes order details to Edge Function
  })
});

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Payment failed');
    }

    // Insert order with 'placed' status
    const { data: newOrder, error: orderError } = await supabase
  .from('orders')
  .insert({
    user_id: user.id,
    store_id: selectedStore.id,
    payment_method_id: paymentMethods.id,
    stripe_payment_intent_id: result.paymentIntentId,
    subtotal: getSubtotal(),
    discount: getTotalDiscounts(),
    tax: getTax(),
    total: getTotal(),
    status: 'placed',
    items: cart,
    pickup_time: orderDetails.pickupTime,
    special_instructions: orderDetails.specialInstructions
  })
      .select()
      .single();

    if (orderError || !newOrder) {
      console.error('Order insert error:', orderError);
      throw new Error('Failed to save order');
    }

    // Now fetch the full order with store details
    const { data: fullOrderData, error: fetchError } = await supabase
  .from('orders')
  .select(`
    *,
    store:stores(id, name, address, phone)
  `)
  .eq('id', newOrder.id)
  .single();

let fullOrder;
if (fetchError || !fullOrderData) {
  console.error('Order fetch error:', fetchError);
  // Still proceed even if fetch fails, use newOrder
  fullOrder = { ...newOrder, store: selectedStore };
} else {
  fullOrder = fullOrderData;
}

    // Parse items if they're stored as JSON string
    fullOrder.items = Array.isArray(fullOrder.items) 
      ? fullOrder.items 
      : JSON.parse(fullOrder.items || '[]');
    
    // UPDATE: Set the active order immediately
    setActiveOrder(fullOrder);

    // Clear cart and navigate to order success screen
    cart.forEach(item => removeFromCart(item.name));
    setCurrentScreen('order-success');
    
    // Store the order ID for tracking
    window.currentOrderId = fullOrder.id;
    
  } catch (err) {
    console.error('Order error:', err);
    alert('Payment failed: ' + err.message);
    throw err;
  }
};

const calculateDeals = async (cartItems, storeId) => {
  if (!cartItems.length || !storeId) return cartItems;

  // Get all active deals for this store
  const today = new Date().toISOString().split('T')[0];
  
  const { data: storeDeals, error } = await supabase
    .from('deal_stores')
    .select(`
      deal_code,
      discount_override,
      deals!inner (
        deal_code,
        description,
        deal_type,
        quantity_required,
        discount_amount,
        discount_percentage,
        priority,
        transaction_limit,
        start_date,
        end_date,
        active
      )
    `)
    .eq('store_id', storeId)
    .eq('active', true)
    .eq('deals.active', true)
    .lte('deals.start_date', today)
    .gte('deals.end_date', today);

  if (error || !storeDeals) {
    console.error('Error fetching deals:', error);
    return cartItems;
  }

  // Get deal products for each deal
  const dealCodes = storeDeals.map(d => d.deal_code);
  const { data: dealProducts } = await supabase
    .from('deal_products')
    .select('deal_code, product_id')
    .in('deal_code', dealCodes);

  if (!dealProducts) return cartItems;

  // Build a map of deal_code to products in that deal
  const dealToProductsMap = {};
  dealProducts.forEach(dp => {
    if (!dealToProductsMap[dp.deal_code]) {
      dealToProductsMap[dp.deal_code] = [];
    }
    dealToProductsMap[dp.deal_code].push(dp.product_id);
  });

  // Group cart items by applicable deals
  const dealGroups = {};
  
  cartItems.forEach(item => {
    // Find which deals this product belongs to
    Object.keys(dealToProductsMap).forEach(dealCode => {
      if (dealToProductsMap[dealCode].includes(item.id)) {
        if (!dealGroups[dealCode]) {
          dealGroups[dealCode] = {
            items: [],
            totalQuantity: 0,
            deal: storeDeals.find(sd => sd.deal_code === dealCode)
          };
        }
        dealGroups[dealCode].items.push(item);
        dealGroups[dealCode].totalQuantity += item.quantity;
      }
    });
  });

  // Calculate discounts for each deal group
  const itemDiscounts = {}; // Map item index to discount info

  Object.keys(dealGroups).forEach(dealCode => {
    const group = dealGroups[dealCode];
    const deal = group.deal.deals;
    const totalQty = group.totalQuantity;

    if (totalQty >= deal.quantity_required) {
      // Calculate how many times this deal applies
      let timesApplied = Math.floor(totalQty / deal.quantity_required);
      
      // Respect transaction limit
      if (deal.transaction_limit) {
        timesApplied = Math.min(timesApplied, deal.transaction_limit);
      }

      // Calculate discount per unit
      const discountPerDeal = group.deal.discount_override || deal.discount_amount || 0;
      const totalDiscount = discountPerDeal * timesApplied;
      const unitsInDeal = timesApplied * deal.quantity_required;
      
      // Distribute discount proportionally across items in the deal
      let remainingDiscount = totalDiscount;
      let remainingUnits = unitsInDeal;

      group.items.forEach(item => {
        const itemIndex = cartItems.findIndex(ci => ci.id === item.id && ci.name === item.name);
        const unitsToDiscount = Math.min(item.quantity, remainingUnits);
        const itemDiscount = (totalDiscount / unitsInDeal) * unitsToDiscount;

        if (!itemDiscounts[itemIndex] || deal.priority > (itemDiscounts[itemIndex].priority || 0)) {
          itemDiscounts[itemIndex] = {
            discountAmount: itemDiscount,
            appliedDeal: {
              ...deal,
              timesApplied,
              unitsInDeal
            },
            priority: deal.priority
          };
        }

        remainingDiscount -= itemDiscount;
        remainingUnits -= unitsToDiscount;
      });
    }
  });

  // Apply discounts to cart items
  const updatedCart = cartItems.map((item, idx) => {
    if (itemDiscounts[idx]) {
      return {
        ...item,
        appliedDeal: itemDiscounts[idx].appliedDeal,
        discountAmount: itemDiscounts[idx].discountAmount
      };
    }
    return {
      ...item,
      appliedDeal: null,
      discountAmount: 0
    };
  });

  return updatedCart;
};

const addToCart = async (product) => {
    if (!product || !product.name || !product.price) {
      console.error('Invalid product:', product);
      return;
    }

    // Create new cart with the added/updated item
    let newCart;
    const existingItem = cart.find(item => item.name === product.name);
    
    if (existingItem) {
      // Update existing item quantity
      newCart = cart.map(item => 
        item.name === product.name 
          ? {...item, quantity: item.quantity + 1}
          : item
      );
    } else {
      // Add new item
      newCart = [...cart, { 
        ...product, 
        quantity: 1,
        discountAmount: 0,
        appliedDeal: null
      }];
    }
    
    // Apply deals to the new cart
    if (selectedStore) {
      const cartWithDeals = await calculateDeals(newCart, selectedStore.id);
      setCart(cartWithDeals);
    } else {
      setCart(newCart);
    }
  };

  const updateQuantity = async (productName, change) => {
    const updatedCart = cart.map(item => {
      if (item.name === productName) {
        const newQuantity = item.quantity + change;
        return newQuantity > 0 ? {...item, quantity: newQuantity} : null;
      }
      return item;
    }).filter(Boolean);
    
    // Apply deals after quantity change
    if (selectedStore && updatedCart.length > 0) {
      const cartWithDeals = await calculateDeals(updatedCart, selectedStore.id);
      setCart(cartWithDeals);
    } else {
      setCart(updatedCart);
    }
  };

  const removeFromCart = (productName) => {
    setCart(cart.filter(item => item.name !== productName));
  };

  const getTotalItems = () => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  };

  const getSubtotal = () => {
  return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
};

const getTotalDiscounts = () => {
  return cart.reduce((sum, item) => sum + (item.discountAmount || 0), 0);
};

const getSubtotalBeforeDiscounts = () => {
  return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
};

  const getTax = () => {
  if (!selectedStore) return 0;
  const subtotalAfterDiscounts = getSubtotal() - getTotalDiscounts();
  return subtotalAfterDiscounts * selectedStore.tax_rate;
};

  const getTotal = () => {
  return getSubtotal() - getTotalDiscounts() + getTax();
};

  const [mapCenter, setMapCenter] = useState({ lat: 0, lng: 0 });
  const [zoom, setZoom] = useState(9);
  const [userLocation, setUserLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setCurrentScreen('home');
    setSelectedStore(null);
    setCart([]);
  };

  // Get current day's hours for a store
  const getCurrentHours = (store) => {
    const today = new Date().getDay(); // 0 = Sunday, 6 = Saturday
    
    if (today === 0) {
      return store.hours_sunday || 'Hours not available';
    } else if (today === 6) {
      return store.hours_saturday || 'Hours not available';
    } else {
      return store.hours_weekday || 'Hours not available';
    }
  };

  const getDayLabel = () => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
  };

  // Calculate distance between two coordinates using Haversine formula
  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Get user's current location
  const getUserLocation = () => {
    setIsLocating(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLoc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(userLoc);
          setMapCenter(userLoc);
          setZoom(12);
          setIsLocating(false);
          
          // Calculate distances and sort stores
          if (stores.length > 0) {
            const storesWithDistance = stores.map(store => ({
              ...store,
              calculatedDistance: calculateDistance(
                userLoc.lat, 
                userLoc.lng, 
                store.lat, 
                store.lng
              )
            }));
            
            // Sort by distance and update distance field
            const sortedStores = storesWithDistance.sort((a, b) => 
              a.calculatedDistance - b.calculatedDistance
            ).map(store => ({
              ...store,
              distance: `${store.calculatedDistance.toFixed(1)} mi away`
            }));
            
            setStores(sortedStores);
          }
        },
        (error) => {
          console.error("Error getting location:", error);
          setIsLocating(false);
          alert("Unable to get your location. Please enable location services.");
        }
      );
    } else {
      setIsLocating(false);
      alert("Geolocation is not supported by your browser.");
    }
  };

if (isLoadingRole && user) {
  return (
    <div className="max-w-[375px] mx-auto bg-gray-100 min-h-screen flex items-center justify-center rounded-[20px] shadow-xl overflow-hidden">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}

// Route based on role
if (user && userRole === 'store_manager') {
  return <StoreManagerApp user={user} handleSignOut={handleSignOut} />;
}

// Default: Customer app
return (
  <div className="max-w-[375px] mx-auto bg-gray-100 min-h-screen rounded-[20px] shadow-xl overflow-hidden">
    {!user ? (
        authScreen === 'signin' ? (
          <SignInScreen setAuthScreen={setAuthScreen} setUser={setUser} />
        ) : (
          <SignUpScreen setAuthScreen={setAuthScreen} setUser={setUser} />
        )
      ) : (
        <>
          {/* Status Bar */}
          <div className="bg-black text-white text-xs p-2 flex justify-between items-center">
            <span>2:39 PM</span>
            <span>🔋 100%</span>
          </div>

          {/* Header */}
          <div className="text-white p-4 flex justify-between items-center" style={{ backgroundColor: '#FF6600' }}>
            <JackFlashLogo size="small" />
            <div className="flex items-center space-x-3">
              <Bell className="w-6 h-6" />
              <div className="relative">
                <ShoppingCart className="w-6 h-6 cursor-pointer" onClick={() => setCurrentScreen('cart')} />
                {getTotalItems() > 0 && (
                  <span className="absolute -top-2 -right-2 bg-yellow-400 text-black rounded-full text-xs w-5 h-5 flex items-center justify-center">
                    {getTotalItems()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="pb-16">
           {!selectedStore && currentScreen !== 'stores' && currentScreen !== 'account' && currentScreen !== 'loyalty' && currentScreen !== 'order-history' && currentScreen !== 'order-success' && currentScreen !== 'order-tracking' ? (
  <StoreSelectionScreen stores={stores} setSelectedStore={setSelectedStore} setScreen={setCurrentScreen} getUserLocation={getUserLocation} isLocating={isLocating} userLocation={userLocation} getCurrentHours={getCurrentHours} getDayLabel={getDayLabel} />
) : (
  <>
    {/* Your existing screen conditionals remain unchanged */}
    {currentScreen === 'home' && <HomeScreen setScreen={setCurrentScreen} loyaltyPoints={loyaltyPoints} selectedStore={selectedStore} addToCart={addToCart} setSelectedStore={setSelectedStore} stores={stores} activeOrder={activeOrder} calculateDeals={calculateDeals} setCart={setCart} cart={cart} />}
    {currentScreen === 'products' && <ProductsScreen setScreen={setCurrentScreen} addToCart={addToCart} selectedStore={selectedStore} products={products} setProducts={setProducts} categories={categories} categoryCounts={categoryCounts} cart={cart} updateQuantity={updateQuantity} />}
   {currentScreen === 'cart' && <CartScreen cart={cart} setScreen={setCurrentScreen} updateQuantity={updateQuantity} removeFromCart={removeFromCart} selectedStore={selectedStore} getSubtotal={getSubtotal} getTax={getTax} getTotal={getTotal} getTotalDiscounts={getTotalDiscounts} />}
    {currentScreen === 'checkout-confirmation' && <CheckoutConfirmationScreen cart={cart} selectedStore={selectedStore} getSubtotal={getSubtotal} getTax={getTax} getTotal={getTotal} getTotalDiscounts={getTotalDiscounts} setScreen={setCurrentScreen} onConfirmOrder={handleConfirmOrder} />}
    {currentScreen === 'tobacco' && <TobaccoScreen setScreen={setCurrentScreen} />}
    {currentScreen === 'stores' && <StoresScreen stores={stores} setScreen={setCurrentScreen} selectedStore={selectedStore} setSelectedStore={setSelectedStore} mapCenter={mapCenter} setMapCenter={setMapCenter} zoom={zoom} setZoom={setZoom} getUserLocation={getUserLocation} isLocating={isLocating} userLocation={userLocation} getCurrentHours={getCurrentHours} getDayLabel={getDayLabel} />}
    {currentScreen === 'loyalty' && <LoyaltyScreen loyaltyPoints={loyaltyPoints} setScreen={setCurrentScreen} />}
    {currentScreen === 'account' && <AccountScreen user={user} handleSignOut={handleSignOut} setScreen={setCurrentScreen} />}
    {currentScreen === 'order-history' && <OrderHistoryScreen user={user} setScreen={setCurrentScreen} stores={stores} setTrackingOrderId={setTrackingOrderId} />}
    {currentScreen === 'order-success' && <OrderSuccessScreen setScreen={setCurrentScreen} />}
    {currentScreen === 'order-tracking' && <OrderTrackingScreen activeOrder={activeOrder} setScreen={setCurrentScreen} trackingOrderId={trackingOrderId} />}
    {currentScreen === 'deal-details' && window.currentDeal && <DealDetailsScreen deal={window.currentDeal} dealProducts={window.currentDealProducts} selectedStore={selectedStore} addToCart={addToCart} setScreen={setCurrentScreen} cart={cart} calculateDeals={calculateDeals} setCart={setCart} />}
  </>
)}
          </div>

          {/* Navigation Bar */}
         <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around p-2 max-w-[375px] mx-auto">
  <NavButton icon={<Home />} label="Home" active={currentScreen === 'home'} onClick={() => setCurrentScreen('home')} />
  <NavButton icon={<Search />} label="Products" active={currentScreen === 'products'} onClick={() => setCurrentScreen('products')} />
  <NavButton icon={<MapPin />} label="Stores" active={currentScreen === 'stores'} onClick={() => setCurrentScreen('stores')} />
  <NavButton icon={<Gift />} label="Rewards" active={currentScreen === 'loyalty'} onClick={() => setCurrentScreen('loyalty')} />
  <NavButton icon={<Shield />} label="Account" active={currentScreen === 'account'} onClick={() => setCurrentScreen('account')} />
</div>
        </>
      )}
    </div>
  );
};

const NavButton = ({ icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className="flex flex-col items-center p-2"
    style={{ color: active ? '#FF6600' : '#6B7280' }}
  >
    {React.cloneElement(icon, { className: 'w-6 h-6' })}
    <span className="text-xs mt-1">{label}</span>
  </button>
);

const ActionCard = ({ icon, title, subtitle, onClick, color, style }) => (
  <div 
    onClick={onClick}
    className="text-white p-4 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
    style={style || {}}
  >    
    <div className="mb-2">{React.cloneElement(icon, { className: 'w-8 h-8' })}</div>
    <h3 className="font-bold">{title}</h3>
    <p className="text-sm opacity-90">{subtitle}</p>
  </div>
);

const DealCard = ({ deal, onClick }) => (
  <div 
    onClick={onClick}
    className="bg-white border border-gray-200 p-4 rounded-lg cursor-pointer hover:border-orange-400 hover:shadow-md transition-all"
  >
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <h4 className="font-medium mb-1">{deal.description}</h4>
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-600">{deal.expires}</p>
          <span className="text-orange-600 font-bold text-sm">{deal.discount}</span>
        </div>
      </div>
      <span className="text-gray-400 ml-2">→</span>
    </div>
  </div>
);

const DealDetailsScreen = ({ deal, dealProducts, selectedStore, addToCart, setScreen, cart, calculateDeals, setCart }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [initialCartQuantity, setInitialCartQuantity] = useState(0);

  useEffect(() => {
    const initialDealItems = cart.filter(item => 
      dealProducts.some(dp => dp.product_id === item.id)
    );
    const initialQty = initialDealItems.reduce((sum, item) => sum + item.quantity, 0);
    setInitialCartQuantity(initialQty);
  }, []);

  useEffect(() => {
    const fetchDealProducts = async () => {
      if (!dealProducts || dealProducts.length === 0) {
        setLoading(false);
        return;
      }

      const productIds = dealProducts.map(dp => dp.product_id);

      // Get store-specific products with pricing
      const { data: storeProductData, error } = await supabase
        .from('store_products')
        .select('price, available, product_id')
        .eq('store_id', selectedStore.id)
        .eq('available', true)
        .in('product_id', productIds);

      if (error || !storeProductData) {
        console.error('Error fetching store products:', error);
        setLoading(false);
        return;
      }

      // Get product details
      const storeProductIds = storeProductData.map(sp => sp.product_id);
      const { data: productDetails, error: prodError } = await supabase
        .from('products')
        .select('*')
        .in('id', storeProductIds);

      if (!prodError && productDetails) {
        const productList = productDetails.map(product => {
          const storeProduct = storeProductData.find(sp => sp.product_id === product.id);
          return {
            ...product,
            price: storeProduct.price,
            available: storeProduct.available
          };
        });
        setProducts(productList);
      }
      setLoading(false);
    };

    fetchDealProducts();
  }, [dealProducts, selectedStore]);
  
  // Count how many deal products are in the cart
  const currentDealItems = cart.filter(item => 
    products.some(p => p.id === item.id)
  );
  
  const currentQuantity = currentDealItems.reduce((sum, item) => sum + item.quantity, 0);
  const itemsAddedThisSession = Math.max(0, currentQuantity - initialCartQuantity);

  const progress = Math.min(itemsAddedThisSession, deal.quantity_required);
  const isComplete = itemsAddedThisSession >= deal.quantity_required;
  const timerRef = useRef(null);

  // Auto-navigate when deal is satisfied
useEffect(() => {
  if (isComplete && !showToast) {
    setToastMessage(`Deal complete! ${itemsAddedThisSession} item${itemsAddedThisSession !== 1 ? 's' : ''} added to cart!`);
    setShowToast(true);
    
    timerRef.current = setTimeout(() => {
      setScreen('products');
    }, 2500);
  }
}, [isComplete, cart, products, setScreen]);

  if (loading) {
    return (
      <div className="p-4 min-h-screen" style={{ 
      backgroundImage: `url("${getImageUrl('app-assets', 'hd_green_texture.png')}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      position: 'relative'
    }}>
        <div className="text-center py-12">
          <div className="animate-pulse text-gray-600">Loading deal products...</div>
        </div>
      </div>
    );
  }

   return (
<div className="p-4 min-h-screen" style={{ 
      backgroundImage: `url("${getImageUrl('app-assets', 'hd_green_texture.png')}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      position: 'relative'
    }}>
  {showToast && (
    <ToastNotification 
      message={toastMessage} 
      onClose={() => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        setShowToast(false);
      }} 
    />
  )}
  
  {/* Header */}
  <div className="flex items-center mb-4">
    <button 
      onClick={() => setScreen('home')}
      className="text-gray-600 hover:text-gray-900 mr-3"
    >
      ← Back
    </button>
    <h2 className="text-xl font-bold text-gray-900">Deal Details</h2>
  </div>

  {/* Deal Info Card */}
  <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-5 rounded-xl mb-4 shadow-lg">
    <div className="flex items-start justify-between mb-3">
      <div className="flex-1">
        <h3 className="text-lg font-bold mb-1">{deal.description}</h3>
        <p className="text-sm opacity-90">
          Buy {deal.quantity_required} and save ${deal.discount_amount?.toFixed(2)}
        </p>
      </div>
      <div className="text-2xl">🎉</div>
    </div>

    {/* Progress Bar */}
    <div className="bg-white bg-opacity-20 rounded-full h-3 mb-2 overflow-hidden">
      <div 
        className="bg-white h-full transition-all duration-500 ease-out"
        style={{ width: `${(progress / deal.quantity_required) * 100}%` }}
      ></div>
    </div>

    <div className="flex justify-between items-center text-sm">
      <span className="font-medium">
        Step {progress} of {deal.quantity_required}
      </span>
      {isComplete ? (
        <span className="bg-white text-green-600 px-3 py-1 rounded-full font-bold text-xs">
          ✓ Deal Complete!
        </span>
      ) : (
        <span className="opacity-90">
          {deal.quantity_required - progress} more to go
        </span>
      )}
    </div>
  </div>

  {/* Products */}
  <div className="mb-4">
    <h3 className="font-bold text-lg text-gray-800 mb-3">
      Choose from these products:
    </h3>
    
    {products.length === 0 ? (
      <div className="bg-gray-50 p-6 rounded-lg text-center">
        <p className="text-gray-600">No products available for this deal at this store.</p>
      </div>
    ) : (
<div className="space-y-3">
  {products.map((product) => {
    const inCart = cart.find(item => item.id === product.id);
    const quantityInCart = inCart ? inCart.quantity : 0;

    return (
      <div 
        key={product.id} 
        className="bg-white border-2 border-gray-200 p-4 rounded-lg hover:border-orange-300 transition-all"
      >
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center flex-1">
            <ProductImageDisplay 
  product={product} 
  size="large"
/>
            <div className="flex-1">
              <h4 className="font-bold text-gray-900">{product.name}</h4>
              <p className="text-sm text-gray-600 mb-1">{product.description}</p>
              <p className="text-green-600 font-bold">
                ${Number(product.price).toFixed(2)}
              </p>
            </div>
          </div>
          {quantityInCart === 0 ? (
            <button 
              onClick={() => addToCart(product)}
              className="bg-orange-500 text-white px-6 py-3 rounded-lg hover:bg-orange-600 ml-3 transition-colors font-bold"
            >
              Add
            </button>
          ) : null}
        </div>
        
        {quantityInCart > 0 && (
          <div className="flex items-center justify-between bg-orange-50 border border-orange-200 p-3 rounded-lg">
            <span className="text-sm text-orange-800 font-medium">
              Added to deal
            </span>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => {
                  const updateQuantity = async (productName, change) => {
                    const existingItem = cart.find(item => item.name === productName);
                    if (existingItem && existingItem.quantity + change <= 0) {
                      // Remove from cart
                      const updatedCart = cart.filter(item => item.name !== productName);
                      if (selectedStore) {
                        const cartWithDeals = await calculateDeals(updatedCart, selectedStore.id);
                        setCart(cartWithDeals);
                      } else {
                        setCart(updatedCart);
                      }
                    } else {
                      // Update quantity
                      const updatedCart = cart.map(item => {
                        if (item.name === productName) {
                          return {...item, quantity: item.quantity + change};
                        }
                        return item;
                      });
                      if (selectedStore) {
                        const cartWithDeals = await calculateDeals(updatedCart, selectedStore.id);
                        setCart(cartWithDeals);
                      } else {
                        setCart(updatedCart);
                      }
                    }
                  };
                  updateQuantity(product.name, -1);
                }}
                className="bg-gray-200 w-8 h-8 rounded-lg hover:bg-gray-300 transition-colors font-bold"
              >
                −
              </button>
              <span className="font-bold text-gray-900 min-w-[20px] text-center">
                {quantityInCart}
              </span>
              <button 
                onClick={() => addToCart(product)}
                className="bg-gray-200 w-8 h-8 rounded-lg hover:bg-gray-300 transition-colors font-bold"
              >
                +
              </button>
            </div>
          </div>
        )}
      </div>
    );
  })}
</div>
    )}
  </div>
</div>
  );
};

const StoreSelectionScreen = ({ stores, setSelectedStore, setScreen, getUserLocation, isLocating, userLocation, getCurrentHours, getDayLabel }) => (
  <div className="p-4 min-h-screen" style={{ 
      backgroundImage: `url("${getImageUrl('app-assets', 'hd_green_texture.png')}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      position: 'relative'
    }}>
    <div className="text-center mb-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Select Your Store</h2>
      <p className="text-gray-600">Choose your location to start ordering</p>
      
      <button
        onClick={getUserLocation}
        disabled={isLocating}
        className="mt-4 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 flex items-center justify-center mx-auto gap-2"
      >
        <MapPin className="w-5 h-5" />
        {isLocating ? 'Finding your location...' : 'Find Nearest Store'}
      </button>
      
      {userLocation && (
        <p className="text-green-600 text-sm mt-2">
          ✓ Location detected - stores sorted by distance
        </p>
      )}
    </div>
    
    <div className="space-y-4">
      {stores.map((store) => (
        <div 
          key={store.id}
          onClick={() => {
            setSelectedStore(store);
            setScreen('home');
          }}
          className="bg-white border border-gray-200 p-4 rounded-lg cursor-pointer hover:shadow-md hover:border-red-300 transition-all"
        >
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-lg text-gray-900">{store.name}</h3>
            <span className="text-sm text-green-600 font-medium">{store.status}</span>
          </div>
          <p className="text-gray-600 mb-2">{store.address}</p>
           <div className="mb-2">
            <span className="text-sm text-gray-500">{store.distance}</span>
          </div>
          
          <div className="bg-gray-50 p-2 rounded mb-2">
            <p className="text-xs text-gray-600 font-medium">{getDayLabel()} Hours:</p>
            <p className="text-sm text-gray-800 font-bold">{getCurrentHours(store)}</p>
          </div>
          
          <div className="flex gap-2 mt-2">
            {store.store_categories && store.store_categories.map(cat => (
              cat.categories.name === 'Pizza' && (
                <span key={cat.categories.id} className="text-xs bg-orange-100 text-orange-600 px-2 py-1 rounded">
                  {cat.categories.icon} {cat.categories.name}
                </span>
              )
            ))}
            {store.store_categories && store.store_categories.map(cat => (
              cat.categories.name === 'Tobacco' && (
                <span key={cat.categories.id} className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">
                  {cat.categories.icon} {cat.categories.name} Available
                </span>
              )
            ))}
          </div>
        </div>
      ))}
    </div>
    
    <div className="mt-6 text-center">
      <button 
        onClick={() => setScreen('stores')}
        className="text-red-600 text-sm font-medium hover:underline"
      >
        View all store details
      </button>
    </div>
  </div>
);

const ToastNotification = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-slide-down">
      <div className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm">
        <div className="w-10 h-10 bg-white bg-opacity-20 rounded-full flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="font-bold text-lg">{message}</p>
          <p className="text-sm opacity-90">Check your cart to continue</p>
        </div>
        <button 
          onClick={onClose}
          className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-1 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

const HomeScreen = ({ setScreen, loyaltyPoints, selectedStore, addToCart, setSelectedStore, stores, activeOrder, calculateDeals, setCart, cart }) => {
  const [recentOrder, setRecentOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState([]);
  const [fullDeals, setFullDeals] = useState([]);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [userName, setUserName] = useState('');

useEffect(() => {
    const fetchUserName = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name')
          .eq('id', user.id)
          .single();
        
        setUserName(profile?.first_name || 'friend');
      }
    };
    fetchUserName();
  }, []);

useEffect(() => {
  const fetchDeals = async () => {
    if (!selectedStore) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('deal_stores')
      .select(`
        deal_code,
        discount_override,
        deals!inner (
          deal_code,
          description,
          deal_type,
          quantity_required,
          discount_amount,
          discount_percentage,
          priority,
          start_date,
          end_date,
          active
        )
      `)
      .eq('store_id', selectedStore.id)
      .eq('active', true)
      .eq('deals.active', true)
      .lte('deals.start_date', today)
      .gte('deals.end_date', today);
    
    if (!error && data) {
      // Store full deal data
      setFullDeals(data);
      
      // Format deals for display
      const formattedDeals = data.map(dealStore => ({
        ...dealStore.deals,
        dealStoreInfo: dealStore,
        title: dealStore.deals.description,
        discount: dealStore.discount_override 
          ? `$${dealStore.discount_override.toFixed(2)} off` 
          : `$${dealStore.deals.discount_amount?.toFixed(2)} off`,
        expires: `Ends ${new Date(dealStore.deals.end_date).toLocaleDateString()}`
      }));
      setDeals(formattedDeals);
    }
  };

  fetchDeals();
}, [selectedStore?.id]);

  useEffect(() => {
    const fetchRecentOrder = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !selectedStore) {
        setLoading(false);
        return;  // No store = no fetch
      }

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          store:stores(id, name)
        `)
        .eq('user_id', user.id)
        .eq('store_id', selectedStore.id)  // Filter by current store only
        .order('created_at', { ascending: false })
        .limit(1);  // Most recent for this store

      if (error) {
        console.error('Error fetching recent order:', error);
      } else if (data && data.length > 0) {
        const order = data[0];
        order.items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
        setRecentOrder(order);
      }
      setLoading(false);
    };

    fetchRecentOrder();
  }, [selectedStore?.id]);  // Re-fetch on store change

const handleReorder = async () => {
  if (!recentOrder || !addToCart) return;

  // Already on the right store (from filter), but set explicitly if needed
  if (recentOrder.store_id && setSelectedStore && stores) {
    const orderStore = stores.find(s => s.id === recentOrder.store_id);
    if (orderStore && orderStore.id !== selectedStore?.id) {
      setSelectedStore(orderStore);
    }
  }

  // Start with existing cart, then add reordered items
  let newCart = [...cart];
  
  for (const item of recentOrder.items) {
    const productToAdd = {
      ...item,
      id: item.id || item.product_id,
      name: item.name.trim(),
      price: Number(item.price),
      quantity: item.quantity || 1,
      discountAmount: 0,
      appliedDeal: null
    };
    
    // Check if item already exists in newCart
    const existingIndex = newCart.findIndex(i => i.name === productToAdd.name);
    if (existingIndex >= 0) {
      newCart[existingIndex].quantity += productToAdd.quantity;
    } else {
      newCart.push(productToAdd);
    }
  }
  
  // Apply deals to the complete cart
  if (selectedStore) {
    const cartWithDeals = await calculateDeals(newCart, selectedStore.id);
    setCart(cartWithDeals);
  } else {
    setCart(newCart);
  }

  // Show toast notification
  const totalQuantity = recentOrder.items.reduce((sum, item) => sum + item.quantity, 0);
  setToastMessage(`${totalQuantity} item${totalQuantity !== 1 ? 's' : ''} added to cart!`);
  setShowToast(true);
};

const formatDate = (dateStr) => {
  return new Date(dateStr).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    hour: 'numeric', 
    minute: '2-digit' 
  });
};

const fullLayout = (content) => (
    <div className="p-4 min-h-screen" style={{ 
      backgroundImage: `url("${getImageUrl('app-assets', 'hd_green_texture.png')}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      position: 'relative'
    }}>      
        <div className="bg-white border-l-4 p-3 rounded-lg mb-4 flex justify-between items-center shadow-sm" style={{ borderLeftColor: '#FF6600' }}>
        <div>
          <p className="text-sm font-medium" style={{ color: '#666' }}>Ordering from:</p>
          <p className="font-bold" style={{ color: '#3C3C3C' }}>{selectedStore?.name}</p>
        </div>
        <button 
          onClick={() => setScreen('stores')}
          className="text-sm font-medium hover:underline"
          style={{ color: '#8BC53F' }}
        >
          Change Store
        </button>
      </div>

<div className="bg-white p-4 rounded-lg mb-4 shadow-md border-l-4" style={{ borderLeftColor: '#FF6600' }}>
  <h2 className="text-lg font-bold" style={{ color: '#3C3C3C' }}>
    Welcome back{userName ? `, ${userName}` : ''}!
  </h2>
  <p className="text-sm" style={{ color: '#8BC53F' }}>Kickback Points: {loyaltyPoints.toLocaleString()}</p>
</div>

      <div className="grid grid-cols-2 gap-4 mb-6">
       <ActionCard 
          icon={<ShoppingCart />} 
          title="Order Ahead" 
          subtitle="Skip the line"
          onClick={() => setScreen('products')}
          color="bg-orange-500"
          style={{ backgroundColor: '#FF6600' }}
        />
        {selectedStore?.store_categories && selectedStore.store_categories.some(cat => cat.categories.name === 'Tobacco') && (
          <ActionCard 
            icon={<Shield />} 
            title="Tobacco Products" 
            subtitle="21+ verification"
            onClick={() => setScreen('tobacco')}
            color="bg-orange-500"
          />
        )}
      </div>

{deals && deals.length > 0 && (
  <section className="mb-6">
    <h3 className="font-bold text-lg text-gray-800 mb-3">Today's Deals</h3>
    <div className="space-y-3">
      {deals.map((deal, idx) => (
        <DealCard 
          key={idx}
          deal={deal} 
          onClick={async () => {
            // Fetch products for this deal
            const { data: dealProducts } = await supabase
              .from('deal_products')
              .select('product_id')
              .eq('deal_code', deal.deal_code);
            
            window.currentDeal = deal;
            window.currentDealProducts = dealProducts || [];
            setScreen('deal-details');
          }}
        />
      ))}
    </div>
  </section>
)}
      {activeOrder && (
        <section className="mb-6">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-bold text-lg">Active Order</h3>
                <p className="text-sm opacity-90">Order #{activeOrder.id.substring(0, 8).toUpperCase()}</p>
              </div>
              <div className="w-10 h-10 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
              </div>
            </div>
            
            <div className="bg-white bg-opacity-20 rounded-lg p-3 mb-3">
              <p className="text-sm font-medium mb-1">
                Status: {activeOrder.status === 'placed' ? '📋 Order Placed' : activeOrder.status === 'received' ? '👨‍🍳 Order Received' : '✅ Ready'}
              </p>
              <p className="text-xs opacity-90">
                {activeOrder.items.length} item{activeOrder.items.length !== 1 ? 's' : ''} • ${activeOrder.total.toFixed(2)}
              </p>
            </div>
            
            <button 
              onClick={() => setScreen('order-tracking')}
              className="w-full bg-white text-blue-600 py-2 rounded-lg font-medium hover:bg-opacity-90 transition-colors"
            >
              Track Order
            </button>
          </div>
        </section>
      )}

      <section>
        <h3 className="font-bold text-lg text-gray-800 mb-3">Recent Order</h3>
        {content}
      </section>
    </div>
  );

  if (loading) {
    return fullLayout(
      <div className="bg-gray-50 p-4 rounded-lg text-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <>
      {showToast && (
        <ToastNotification 
          message={toastMessage} 
          onClose={() => setShowToast(false)} 
        />
      )}
      {fullLayout(
        recentOrder ? (
          <div className="bg-white border border-gray-200 p-4 rounded-lg">
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="font-medium">{recentOrder.items.slice(0, 2).map(item => item.name).join(', ')}{recentOrder.items.length > 2 ? ' + more' : ''}</p>
            <p className="text-sm text-gray-600">{recentOrder.store?.name || `Store #${recentOrder.store_id}`} • {formatDate(recentOrder.created_at)}</p>
          </div>
        </div>
        <div className="text-sm text-gray-600 mb-2">Total: ${recentOrder.total?.toFixed(2)}</div>
        <button 
          onClick={handleReorder}
          className="text-sm font-medium hover:underline w-full text-left"
          style={{ color: '#FF6600' }}
        >
          Reorder
        </button>
      </div>
    ) : (
      <div className="bg-gray-50 p-4 rounded-lg text-center">
        <p className="text-gray-600">No recent orders at this store.</p>
        <button 
          onClick={() => setScreen('products')}
          className="text-red-600 text-sm font-medium hover:underline mt-2"
        >
          Start Ordering
        </button>
      </div>
    )
  )}
    </>
  );
};

  const ProductsScreen = ({ setScreen, addToCart, selectedStore, products, setProducts, categories, categoryCounts, cart, updateQuantity }) => {
  const [selectedCategory, setSelectedCategory] = useState(null);
  
  // Filter categories to only show those available at this store
  const availableCategories = categories.filter(cat => 
    selectedStore?.store_categories?.some(sc => sc.categories.id === cat.id)
  );

  const loadCategoryProducts = async (categoryId) => {
  if (!selectedStore) return;
  
  // Get all products for this category
  const { data: categoryProducts, error: catError } = await supabase
    .from('products')
    .select('id')
    .eq('categories', categoryId);
  
  if (catError) {
    console.error('Error fetching category products:', catError);
    return;
  }
  
  const productIds = categoryProducts.map(p => p.id);
  
  // Get store-specific products with pricing
  const { data, error } = await supabase
    .from('store_products')
    .select(`
      price,
      available,
      product_id
    `)
    .eq('store_id', selectedStore.id)
          .in('product_id', productIds);
  
  if (error) {
    console.error('Error fetching products:', error);
    return;
  }
  
  if (data && data.length > 0) {
    // Get the product details
    const storeProductIds = data.map(sp => sp.product_id);
    const { data: productDetails, error: prodError } = await supabase
      .from('products')
      .select('*')
      .in('id', storeProductIds);
    
    if (!prodError) {
      // Merge store pricing with product details
      const productList = productDetails.map(product => {
        const storeProduct = data.find(sp => sp.product_id === product.id);
        return {
          ...product,
          price: storeProduct.price,
          available: storeProduct.available
        };
      });
      setProducts(productList);
    }
  } else {
    setProducts([]);
  }
};

  const handleCategoryClick = (category) => {
    if (category.restricted) {
      setScreen('tobacco');
    } else {
      setSelectedCategory(category);
      loadCategoryProducts(category.id);
    }
  };

    return (
<div className="p-4 min-h-screen" style={{ 
  backgroundImage: `url("${getImageUrl('app-assets', 'hd_green_texture.png')}")`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundAttachment: 'fixed',
  position: 'relative'
}}>
      <div className="bg-white border-l-4 p-3 rounded-lg mb-4 flex justify-between items-center shadow-sm" style={{ borderLeftColor: '#FF6600' }}>
        <div>
          <p className="text-sm font-medium" style={{ color: '#666' }}>Ordering from:</p>
          <p className="font-bold" style={{ color: '#3C3C3C' }}>{selectedStore?.name}</p>
        </div>
        <button 
          onClick={() => setScreen('stores')}
          className="text-sm font-medium hover:underline"
          style={{ color: '#8BC53F' }}
        >
          Change Store
        </button>
      </div>

      <div className="mb-4">
        <input 
          type="text" 
          placeholder="Search products..." 
           className="w-full p-3 border-2 border-gray-300 rounded-lg focus:outline-none transition-colors"
          onFocus={(e) => e.target.style.borderColor = '#FF6600'}
          onBlur={(e) => e.target.style.borderColor = '#D1D5DB'}
        />
      </div>

      <section className="mb-6">
        <h3 className="font-bold text-lg text-gray-800 mb-3">Categories</h3>
        <div className="grid grid-cols-2 gap-3">
          {availableCategories.map((category) => (
            <div 
              key={category.id}
              onClick={() => handleCategoryClick(category)}
              className="bg-white border border-gray-200 p-4 rounded-lg cursor-pointer hover:shadow-md transition-shadow"
            >
              <CategoryIcon category={category} />
              <h4 className="font-medium">{category.name}</h4>
              <p className="text-sm text-gray-600">{categoryCounts[category.id] || 0} items</p>
              {category.restricted && (
                <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded mt-2 inline-block">
                  21+ Required
                </span>
              )}
              {category.category_type === 'pizza' && (
                <span className="text-xs bg-orange-100 text-orange-600 px-2 py-1 rounded mt-2 inline-block">
                  Fresh Made Daily
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {selectedCategory && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-lg text-gray-800">
              {selectedCategory.name} Menu
            </h3>
            <button 
              onClick={() => {
                setSelectedCategory(null);
                setProducts([]);
              }}
              className="text-red-600 text-sm font-medium hover:underline"
            >
              Back to Categories
            </button>
          </div>
          
          <div className="space-y-3">
{products.length > 0 ? products.map((product, idx) => {
    const inCart = cart.find(item => item.id === product.id);
    const quantityInCart = inCart ? inCart.quantity : 0;
    const isOutOfStock = !product.available;
    
    return (
      <div 
  key={idx} 
  className={`bg-white border border-gray-200 p-4 rounded-lg ${isOutOfStock ? 'opacity-60' : ''}`}
>
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center flex-1">
            <ProductImageDisplay 
              product={product} 
              size="medium"
              category={selectedCategory}
            />
            <div className="flex-1 ml-3">
              <h4 className="font-medium">{product.name || 'Unnamed Product'}</h4>
<p className="text-sm text-gray-600 mb-1">{product.description || `Delicious ${selectedCategory.name.toLowerCase()}`}</p>
              <p className="text-2xl font-bold" style={{ color: '#8BC53F' }}>
                ${product.price ? Number(product.price).toFixed(2) : 'Price unavailable'}
              </p>
              {isOutOfStock && (
                <p className="text-xs text-red-600 font-medium mt-1">
                  Currently Unavailable
                </p>
              )}
            </div>
          </div>
          {!isOutOfStock && quantityInCart === 0 ? (
            <button 
              onClick={() => addToCart(product)}
              className="text-white px-5 py-2.5 rounded-lg font-semibold ml-3 transition-all hover:opacity-90 shadow-md"
              style={{ backgroundColor: '#FF6600' }}
              disabled={!product.price}
            >
              Add
            </button>
          ) : isOutOfStock ? (
            <button 
              disabled
              className="bg-gray-300 text-gray-500 px-5 py-2.5 rounded-lg font-semibold ml-3 cursor-not-allowed"
            >
              Unavailable
            </button>
          ) : null}
        </div>
        
        {!isOutOfStock && quantityInCart > 0 && (
          <div className="flex items-center justify-end gap-3 mt-3">
  <button 
    onClick={() => updateQuantity(product.name, -1)}
    className="bg-gray-200 w-8 h-8 rounded-lg hover:bg-gray-300 transition-colors"
  >
    −
  </button>
  <span className="font-medium min-w-[20px] text-center">
    {quantityInCart}
  </span>
  <button 
    onClick={() => addToCart(product)}
    className="bg-gray-200 w-8 h-8 rounded-lg hover:bg-gray-300 transition-colors"
  >
    +
  </button>
</div>
        )}
        
        {selectedCategory.category_type === 'pizza' && !isOutOfStock && (
          <div className="mt-3 text-xs font-medium px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(255, 102, 0, 0.1)', color: '#FF6600' }}>
            🕐 Ready in 15-20 minutes
          </div>
        )}
      </div>
    );
  }) : (
    <div className="text-center text-gray-400 py-8">
      No {selectedCategory.name.toLowerCase()} products available at this store
    </div>
  )}
</div>
        </section>
      )}
    </div>
  );
};

const TobaccoScreen = ({ setScreen }) => (
  <div className="p-4 min-h-screen" style={{ 
      backgroundImage: `url("${getImageUrl('app-assets', 'hd_green_texture.png')}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      position: 'relative'
    }}>
    <div className="bg-yellow-50 border-2 border-yellow-400 p-4 rounded-lg mb-6">
      <div className="flex items-start">
        <Shield className="w-6 h-6 text-yellow-600 mr-3 flex-shrink-0" />
        <div>
          <h3 className="font-bold text-yellow-900 mb-2">Age Verification Required</h3>
          <p className="text-sm text-yellow-800">
            You must be 21 years or older to purchase tobacco products. Valid ID required at pickup.
          </p>
        </div>
      </div>
    </div>

    <div className="bg-white border border-gray-200 p-6 rounded-lg text-center">
      <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
      <h3 className="font-bold text-xl mb-2">Verify Your Age</h3>
      <p className="text-gray-600 mb-6">
        To access tobacco products, you must verify that you are 21 years of age or older.
      </p>
      <button className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors w-full mb-3">
        Verify with ID
      </button>
      <button 
        onClick={() => setScreen('products')}
        className="text-gray-600 hover:underline"
      >
        Go Back
      </button>
    </div>
  </div>
);

const CartScreen = ({ cart, setScreen, updateQuantity, removeFromCart, selectedStore, getSubtotal, getTax, getTotal, getTotalDiscounts }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const handleCheckout = async () => {
  setError('');
  setIsProcessing(true);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('Please sign in to checkout');
      setIsProcessing(false);
      return;
    }

    const { data: paymentMethods } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .single();

    if (!paymentMethods) {
      alert('Please add a payment method first');
      setScreen('account');
      setIsProcessing(false);
      return;
    }

    const response = await fetch(process.env.REACT_APP_EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        amount: getTotal(),
        paymentMethodId: paymentMethods.stripe_payment_method_id,
        userId: user.id,
        userEmail: user.email
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Payment failed');
    }

    const { error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        store_id: selectedStore.id,
        payment_method_id: paymentMethods.id,
        stripe_payment_intent_id: result.paymentIntentId,
        subtotal: getSubtotal(),
        tax: getTax(),
        total: getTotal(),
        status: 'completed',
        items: cart
      });

    if (orderError) {
      console.error('Order save error:', orderError);
      throw new Error('Payment successful but failed to save order');
    }

    alert('Order placed successfully!');
    cart.forEach(item => removeFromCart(item.name));
    setScreen('home');
    
  } catch (err) {
    setError(err.message);
    alert('Payment failed: ' + err.message);
  } finally {
    setIsProcessing(false);
  }
};

  return (
    <div className="p-4 min-h-screen" style={{ 
      backgroundImage: `url("${getImageUrl('app-assets', 'hd_green_texture.png')}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      position: 'relative'
    }}>
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Your Cart</h2>
      
      {cart.length === 0 ? (
        <div className="text-center py-12">
          <ShoppingCart className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">Your cart is empty</p>
          <button 
            onClick={() => setScreen('products')}
            className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors"
          >
            Start Shopping
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-3 mb-6">
  {cart.map((item, idx) => (
    <div key={idx} className="bg-white border border-gray-200 p-4 rounded-lg">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center flex-1">
          <ProductImageDisplay 
  product={item} 
  size="medium"
/>
          <div className="flex-1">
            <h4 className="font-medium">{item.name}</h4>
            <p className="text-green-600 font-bold">${item.price.toFixed(2)}</p>
            {item.appliedDeal && (
              <p className="text-xs text-orange-600 font-medium mt-1">
                🎉 Discount applied!
              </p>
            )}
          </div>
        </div>
        <button 
          onClick={() => removeFromCart(item.name)}
          className="text-red-600 hover:underline text-sm"
        >
          Remove
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button 
          onClick={() => updateQuantity(item.name, -1)}
          className="bg-gray-200 w-8 h-8 rounded-lg hover:bg-gray-300 transition-colors"
        >
          −
        </button>
        <span className="font-medium">{item.quantity}</span>
        <button 
          onClick={() => updateQuantity(item.name, 1)}
          className="bg-gray-200 w-8 h-8 rounded-lg hover:bg-gray-300 transition-colors"
        >
          +
        </button>
        <span className="text-gray-600 ml-auto">
          ${(item.price * item.quantity).toFixed(2)}
        </span>
      </div>
    </div>
  ))}
</div>

          <div className="bg-white border border-gray-200 p-4 rounded-lg mb-6">
  <div className="flex justify-between mb-2">
    <span className="text-gray-600">Subtotal</span>
    <span className="font-medium">${getSubtotal().toFixed(2)}</span>
  </div>
  
  {getTotalDiscounts() > 0 && (
    <div className="flex justify-between mb-2 text-orange-600">
      <span className="font-medium">Discounts Applied</span>
      <span className="font-medium">-${getTotalDiscounts().toFixed(2)}</span>
    </div>
  )}
  
  {/* Future: Loyalty Discount */}
  {/* <div className="flex justify-between mb-2 text-purple-600">
    <span className="font-medium">Loyalty Discount</span>
    <span className="font-medium">-$0.00</span>
  </div> */}
  
  <div className="flex justify-between mb-2">
    <span className="text-gray-600">Tax ({selectedStore ? (selectedStore.tax_rate * 100).toFixed(2) : 0}%)</span>
    <span className="font-medium">${getTax().toFixed(2)}</span>
  </div>
  
  <div className="border-t border-gray-200 pt-2 mt-2">
    <div className="flex justify-between">
      <span className="font-bold text-lg">Total</span>
      <span className="font-bold text-lg text-green-600">${getTotal().toFixed(2)}</span>
    </div>
  </div>
</div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 text-sm">
              {error}
            </div>
          )}

          <button 
  onClick={() => setScreen('checkout-confirmation')}
  className="bg-red-600 text-white px-6 py-4 rounded-lg hover:bg-red-700 transition-colors w-full font-bold text-lg"
>
  Continue to Checkout
</button>
        </>
      )}
    </div>
  );
};

const TimePickerWheel = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wheelRef = useRef(null);

  const generateTimeSlots = () => {
    const slots = [];
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const earliestMinutes = currentMinutes + 25; // At least 25 minutes from now
    
    // Start from next 5-minute mark after earliest time
    let startMinutes = Math.ceil(earliestMinutes / 5) * 5;
    
    // Generate slots until 11:55 PM (23:55)
    const endOfDay = 23 * 60 + 55;
    
    for (let minutes = startMinutes; minutes <= endOfDay; minutes += 5) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      const displayMinutes = mins.toString().padStart(2, '0');
      
      const timeDate = new Date(now);
      timeDate.setHours(hours, mins, 0, 0);
      
      slots.push({
        value: timeDate.toISOString(),
        label: `${displayHours}:${displayMinutes} ${ampm}`,
        minutes: minutes
      });
    }
    
    return slots;
  };

  const timeSlots = generateTimeSlots();
  const selectedIndex = timeSlots.findIndex(slot => slot.value === value);

  const handleScroll = () => {
    if (!wheelRef.current) return;
    
    const scrollTop = wheelRef.current.scrollTop;
    const itemHeight = 48; // Height of each item in pixels
    const centerIndex = Math.round(scrollTop / itemHeight);
    
    if (timeSlots[centerIndex]) {
      onChange(timeSlots[centerIndex].value);
    }
  };

  useEffect(() => {
    if (isOpen && wheelRef.current) {
      const itemHeight = 48;
      const targetScroll = selectedIndex * itemHeight;
      wheelRef.current.scrollTop = targetScroll;
    }
  }, [isOpen, selectedIndex]);

  const displayLabel = value === 'asap' 
    ? 'ASAP (15-20 min)' 
    : timeSlots.find(slot => slot.value === value)?.label || 'Select time';

  return (
    <div>
      <button
        onClick={() => setIsOpen(true)}
        className="w-full p-4 border border-gray-300 rounded-lg text-left flex justify-between items-center bg-white"
      >
        <span className="font-medium">{displayLabel}</span>
        <span className="text-gray-400">▼</span>
      </button>

      {isOpen && (
       <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white w-full rounded-t-3xl">
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <button 
                onClick={() => setIsOpen(false)}
                className="text-red-600 font-medium"
              >
                Cancel
              </button>
              <h3 className="font-bold">Select Pickup Time</h3>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-blue-600 font-medium"
              >
                Done
              </button>
            </div>

            <div className="relative h-64 overflow-hidden">
              {/* Selection indicator */}
              <div className="absolute top-1/2 left-0 right-0 h-12 -mt-6 border-t border-b border-gray-300 bg-gray-50 bg-opacity-50 pointer-events-none z-10" />
              
              {/* ASAP option */}
              <div className="py-3 text-center">
                <button
                  onClick={() => {
                    onChange('asap');
                    setIsOpen(false);
                  }}
                  className={`w-full py-2 ${value === 'asap' ? 'font-bold text-black text-lg' : 'text-gray-400 text-sm'}`}
                >
                  ASAP (15-20 min)
                </button>
              </div>

              {/* Scrollable time wheel */}
              <div 
                ref={wheelRef}
                onScroll={handleScroll}
                className="h-full overflow-y-scroll snap-y snap-mandatory"
                style={{ scrollSnapType: 'y mandatory' }}
              >
                <div className="h-24" /> {/* Top padding */}
                
                {timeSlots.map((slot, index) => {
                  const distance = Math.abs(index - selectedIndex);
                  const isSelected = slot.value === value;
                  
                  return (
                    <div
                      key={slot.value}
                      className="h-12 flex items-center justify-center snap-center transition-all duration-150"
                      onClick={() => {
                        onChange(slot.value);
                        const itemHeight = 48;
                        wheelRef.current.scrollTop = index * itemHeight;
                      }}
                    >
                      <span 
                        className={`transition-all duration-150 ${
                          isSelected 
                            ? 'font-bold text-black text-lg' 
                            : distance === 0
                            ? 'font-bold text-black text-lg'
                            : distance === 1 
                            ? 'text-gray-500 text-base'
                            : 'text-gray-400 text-sm'
                        }`}
                      >
                        {slot.label}
                      </span>
                    </div>
                  );
                })}
                
                <div className="h-24" /> {/* Bottom padding */}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const CheckoutConfirmationScreen = ({ cart, selectedStore, getSubtotal, getTax, getTotal, getTotalDiscounts, setScreen, onConfirmOrder }) => {
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [pickupTime, setPickupTime] = useState('asap');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const fetchPaymentMethods = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('payment_methods')
          .select('*')
          .eq('user_id', user.id)
          .order('is_default', { ascending: false });
        
        if (data && data.length > 0) {
          setPaymentMethods(data);
          setSelectedPaymentMethod(data.find(pm => pm.is_default) || data[0]);
        }
      }
    };
    fetchPaymentMethods();
  }, []);

  const handleConfirm = async () => {
    if (!selectedPaymentMethod) {
      alert('Please select a payment method');
      return;
    }

    setIsProcessing(true);
    
    const orderDetails = {
      paymentMethodId: selectedPaymentMethod.stripe_payment_method_id,
      pickupTime,
      specialInstructions
    };

    await onConfirmOrder(orderDetails);
    setIsProcessing(false);
  };

  const getCardIcon = (brand) => {
    const brandLower = brand.toLowerCase();
    if (brandLower.includes('visa')) return '💳';
    if (brandLower.includes('mastercard')) return '💳';
    if (brandLower.includes('amex')) return '💳';
    return '💳';
  };

  return (
    <div className="p-4 min-h-screen" style={{ 
      backgroundImage: `url("${getImageUrl('app-assets', 'hd_green_texture.png')}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      position: 'relative'
    }}>
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Confirm Order</h2>

      {/* Store Info */}
      <div className="bg-white border border-gray-200 p-4 rounded-lg mb-4">
        <h3 className="font-bold text-lg mb-2">Pickup Location</h3>
        <p className="font-medium text-gray-900">{selectedStore.name}</p>
        <p className="text-gray-600 text-sm">{selectedStore.address}</p>
        <a 
          href={`tel:${selectedStore.phone || '555-0100'}`}
          className="text-blue-600 text-sm hover:underline mt-1 inline-block"
        >
          Call Store
        </a>
      </div>

      {/* Pickup Time */}
     <div className="bg-white border border-gray-200 p-4 rounded-lg mb-4">
  <h3 className="font-bold text-lg mb-3">Pickup Time</h3>
  <TimePickerWheel 
    value={pickupTime}
    onChange={setPickupTime}
  />
</div>

      {/* Order Summary */}
      <div className="bg-white border border-gray-200 p-4 rounded-lg mb-4">
        <h3 className="font-bold text-lg mb-3">Order Summary</h3>
        <div className="space-y-2">
          {cart.map((item, idx) => (
            <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
              <div className="flex items-center gap-2">
                <ProductImageDisplay 
  product={item} 
  size="small"
/>
                <div>
                  <p className="font-medium text-sm">{item.name}</p>
                  <p className="text-gray-600 text-xs">Qty: {item.quantity}</p>
                </div>
              </div>
              <span className="font-medium">${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>
        
       <div className="mt-4 pt-3 border-t border-gray-200 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Subtotal</span>
            <span className="font-medium">${getSubtotal().toFixed(2)}</span>
          </div>
          
          {getTotalDiscounts() > 0 && (
            <div className="flex justify-between text-sm text-orange-600">
              <span className="font-medium">Discounts Applied</span>
              <span className="font-medium">-${getTotalDiscounts().toFixed(2)}</span>
            </div>
          )}
          
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Tax</span>
            <span className="font-medium">${getTax().toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200">
            <span>Total</span>
            <span className="text-green-600">${getTotal().toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Payment Method */}
      <div className="bg-white border border-gray-200 p-4 rounded-lg mb-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-lg">Payment Method</h3>
          <button 
            onClick={() => setScreen('account')}
            className="text-red-600 text-sm hover:underline"
          >
            Manage Cards
          </button>
        </div>
        
        {paymentMethods.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-gray-600 mb-3">No payment methods added</p>
            <button 
              onClick={() => setScreen('account')}
              className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm"
            >
              Add Payment Method
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {paymentMethods.map((pm) => (
              <div
                key={pm.id}
                onClick={() => setSelectedPaymentMethod(pm)}
                className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                  selectedPaymentMethod?.id === pm.id
                    ? 'border-red-600 bg-red-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getCardIcon(pm.card_brand)}</span>
                    <div>
                      <p className="font-medium capitalize">
                        {pm.card_brand} •••• {pm.last4}
                      </p>
                      <p className="text-xs text-gray-600">
                        Expires {pm.exp_month}/{pm.exp_year}
                      </p>
                    </div>
                  </div>
                  {selectedPaymentMethod?.id === pm.id && (
                    <span className="text-red-600 font-bold">✓</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Special Instructions */}
      <div className="bg-white border border-gray-200 p-4 rounded-lg mb-6">
        <h3 className="font-bold text-lg mb-3">Special Instructions (Optional)</h3>
        <textarea
          value={specialInstructions}
          onChange={(e) => setSpecialInstructions(e.target.value)}
          placeholder="Extra napkins, call when ready, etc."
          className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
          rows="3"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => setScreen('cart')}
          className="flex-1 bg-gray-200 text-gray-800 py-4 rounded-lg font-bold hover:bg-gray-300 transition-colors"
        >
          Back to Cart
        </button>
        <button
          onClick={handleConfirm}
          disabled={isProcessing || !selectedPaymentMethod}
          className="flex-1 bg-red-600 text-white py-4 rounded-lg font-bold hover:bg-red-700 transition-colors disabled:bg-gray-400"
        >
          {isProcessing ? 'Processing...' : 'Place Order'}
        </button>
      </div>
    </div>
  );
};

const LoyaltyScreen = ({ loyaltyPoints, setScreen }) => (
  <div className="p-4">
    <div className="bg-gradient-to-r from-red-500 to-red-600 text-white p-6 rounded-lg mb-6 text-center">
      <Star className="w-12 h-12 mx-auto mb-3" />
      <h2 className="text-2xl font-bold mb-2">Kickback Rewards</h2>
      <p className="text-3xl font-bold">{loyaltyPoints.toLocaleString()}</p>
      <p className="text-sm opacity-90">points available</p>
    </div>

    <section className="mb-6">
      <h3 className="font-bold text-lg text-gray-800 mb-3">Available Rewards</h3>
      <div className="space-y-3">
        <RewardCard 
          title="Free Coffee"
          points={500}
          description="Any size, any flavor"
        />
        <RewardCard 
          title="$5 Off Purchase"
          points={1000}
          description="Minimum $15 purchase"
        />
        <RewardCard 
          title="Free Pizza"
          points={2000}
          description="Any regular pizza"
        />
        <RewardCard 
          title="$20 Off Purchase"
          points={4000}
          description="No minimum purchase"
        />
      </div>
    </section>

    <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
      <h4 className="font-bold text-blue-900 mb-2">How to Earn Points</h4>
      <ul className="text-sm text-blue-800 space-y-1">
        <li>• Earn 10 points per $1 spent</li>
        <li>• Double points on Tuesdays</li>
        <li>• Bonus points on featured items</li>
      </ul>
    </div>
  </div>
);

const RewardCard = ({ title, points, description }) => (
  <div className="bg-white border border-gray-200 p-4 rounded-lg">
    <div className="flex justify-between items-start">
      <div className="flex-1">
        <h4 className="font-bold text-gray-900">{title}</h4>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
      <div className="text-right ml-4">
        <div className="text-red-600 font-bold">{points}</div>
        <div className="text-xs text-gray-600">points</div>
      </div>
    </div>
    <button className="mt-3 w-full bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm font-medium">
      Redeem
    </button>
  </div>
);

const SignInScreen = ({ setAuthScreen, setUser }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
    } else {
      setUser(data.user);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex">
      {/* Orange Background - Left Side */}
      <div className="w-1/2" style={{ backgroundColor: '#FF6600' }}></div>
      
      {/* Green Background - Right Side */}
      <div className="w-1/2" style={{ backgroundColor: '#8BC53F' }}></div>

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-center items-center p-6">
{/* Lightning Bolt Icon at Top */}
        <div className="mb-6">
          <svg width="80" height="140" viewBox="0 0 80 140" className="drop-shadow-2xl">
            <polygon 
              points="80,0 30,70 45,70 20,140 80,50 45,50" 
              fill="white"
            />
          </svg>
        </div>

        {/* Logo */}
        <div className="mb-4">
          <JackFlashLogo size="large" />
        </div>
        
        <p className="text-white text-lg font-medium mb-8 drop-shadow-lg">Welcome back!</p>

        {/* Sign In Card */}
        <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm">
          <h2 className="text-2xl font-bold mb-6 text-center" style={{ color: '#3C3C3C' }}>Sign In</h2>
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSignIn}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2" style={{ color: '#3C3C3C' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border-2 rounded-lg focus:outline-none transition-colors"
                style={{ borderColor: '#E5E5E5' }}
                onFocus={(e) => e.target.style.borderColor = '#FF6600'}
                onBlur={(e) => e.target.style.borderColor = '#E5E5E5'}
                required
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium mb-2" style={{ color: '#3C3C3C' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border-2 rounded-lg focus:outline-none transition-colors"
                style={{ borderColor: '#E5E5E5' }}
                onFocus={(e) => e.target.style.borderColor = '#FF6600'}
                onBlur={(e) => e.target.style.borderColor = '#E5E5E5'}
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full text-white py-4 rounded-xl font-bold text-lg hover:opacity-90 transition-opacity disabled:bg-gray-400 shadow-lg"
              style={{ backgroundColor: '#FF6600' }}
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm" style={{ color: '#3C3C3C' }}>
              Don't have an account?{' '}
              <button
                onClick={() => setAuthScreen('signup')}
                className="font-bold hover:underline"
                style={{ color: '#8BC53F' }}
              >
                Sign Up
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
const SignUpScreen = ({ setAuthScreen, setUser }) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    mobileNumber: '',
    birthdate: '',
    zipCode: '',
    password: '',
    confirmPassword: '',
    emailNotifications: true,
    smsNotifications: false
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const validatePassword = (pwd) => {
    if (pwd.length < 8 || pwd.length > 20) return 'Password must be 8-20 characters';
    if (!/[A-Z]/.test(pwd)) return 'Password must contain an uppercase letter';
    if (!/[0-9]/.test(pwd)) return 'Password must contain a number';
    if (!/[!@#$%^&*]/.test(pwd)) return 'Password must contain a special character (!@#$%^&*)';
    return null;
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

const handleSignUp = async (e) => {
  e.preventDefault();
  setError('');

  const pwdError = validatePassword(formData.password);
  if (pwdError) {
    setError(pwdError);
    return;
  }

  if (formData.password !== formData.confirmPassword) {
    setError('Passwords do not match');
    return;
  }

  setIsLoading(true);

  console.log('Starting signup process...');
  
  const { data, error: signUpError } = await supabase.auth.signUp({
    email: formData.email,
    password: formData.password,
  });

  console.log('Signup response:', { data, error: signUpError });

  if (signUpError) {
    setError(signUpError.message);
    setIsLoading(false);
    return;
  }

  if (data.user) {
    console.log('User created with ID:', data.user.id);
    
    // Wait for trigger to create profile row
    console.log('Waiting for profile row to be created...');
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // First, check if profile row exists
    const { data: existingProfile, error: checkError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();
    
    console.log('Existing profile check:', { existingProfile, checkError });
    
    // Now update the profile
    const profileData = {
      first_name: formData.firstName,
      last_name: formData.lastName,
      mobile_number: formData.mobileNumber,
      birthdate: formData.birthdate,
      zip_code: formData.zipCode,
      email_notifications: formData.emailNotifications,
      sms_notifications: formData.smsNotifications
    };
    
    console.log('Updating profile with data:', profileData);
    
        const { data: updatedProfile, error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: data.user.id,
        ...profileData
      }, {
        onConflict: 'id'
      })
      .select();

    console.log('Profile update result:', { updatedProfile, profileError });

    if (profileError) {
      console.error('Profile update error:', profileError);
      alert('Account created but profile save failed: ' + profileError.message);
    } else {
      console.log('Profile saved successfully!', updatedProfile);
    }

    setUser(data.user);
  }
  
  setIsLoading(false);
};

  return (
    <div className="min-h-screen relative overflow-hidden flex">
      {/* Orange Background - Left */}
      <div className="w-1/2" style={{ backgroundColor: '#FF6600' }}></div>
      
      {/* Green Background - Right */}
      <div className="w-1/2" style={{ backgroundColor: '#8BC53F' }}></div>

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-center items-center p-6 overflow-y-auto">
        <div className="my-6">
          <JackFlashLogo size="medium" />
        </div>
        
        <p className="text-white text-lg font-medium mb-6 drop-shadow-lg">Create your account</p>

        {/* Sign Up Card */}
        <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm mb-6">
          <h2 className="text-2xl font-bold mb-4 text-center" style={{ color: '#3C3C3C' }}>Sign Up</h2>
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSignUp}>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#3C3C3C' }}>First Name</label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border-2 rounded-lg focus:outline-none text-sm"
                  style={{ borderColor: '#E5E5E5' }}
                  onFocus={(e) => e.target.style.borderColor = '#FF6600'}
                  onBlur={(e) => e.target.style.borderColor = '#E5E5E5'}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#3C3C3C' }}>Last Name</label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border-2 rounded-lg focus:outline-none text-sm"
                  style={{ borderColor: '#E5E5E5' }}
                  onFocus={(e) => e.target.style.borderColor = '#FF6600'}
                  onBlur={(e) => e.target.style.borderColor = '#E5E5E5'}
                  required
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium mb-1" style={{ color: '#3C3C3C' }}>Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-3 py-2 border-2 rounded-lg focus:outline-none text-sm"
                style={{ borderColor: '#E5E5E5' }}
                onFocus={(e) => e.target.style.borderColor = '#FF6600'}
                onBlur={(e) => e.target.style.borderColor = '#E5E5E5'}
                required
              />
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium mb-1" style={{ color: '#3C3C3C' }}>Mobile Number</label>
              <input
                type="tel"
                name="mobileNumber"
                value={formData.mobileNumber}
                onChange={handleChange}
                placeholder="(555) 123-4567"
                className="w-full px-3 py-2 border-2 rounded-lg focus:outline-none text-sm"
                style={{ borderColor: '#E5E5E5' }}
                onFocus={(e) => e.target.style.borderColor = '#FF6600'}
                onBlur={(e) => e.target.style.borderColor = '#E5E5E5'}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#3C3C3C' }}>Birthdate</label>
                <input
                  type="date"
                  name="birthdate"
                  value={formData.birthdate}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border-2 rounded-lg focus:outline-none text-sm"
                  style={{ borderColor: '#E5E5E5' }}
                  onFocus={(e) => e.target.style.borderColor = '#FF6600'}
                  onBlur={(e) => e.target.style.borderColor = '#E5E5E5'}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#3C3C3C' }}>Zip Code</label>
                <input
                  type="text"
                  name="zipCode"
                  value={formData.zipCode}
                  onChange={handleChange}
                  maxLength="5"
                  className="w-full px-3 py-2 border-2 rounded-lg focus:outline-none text-sm"
                  style={{ borderColor: '#E5E5E5' }}
                  onFocus={(e) => e.target.style.borderColor = '#FF6600'}
                  onBlur={(e) => e.target.style.borderColor = '#E5E5E5'}
                  required
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium mb-1" style={{ color: '#3C3C3C' }}>Password</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="w-full px-3 py-2 border-2 rounded-lg focus:outline-none text-sm"
                style={{ borderColor: '#E5E5E5' }}
                onFocus={(e) => e.target.style.borderColor = '#FF6600'}
                onBlur={(e) => e.target.style.borderColor = '#E5E5E5'}
                required
              />
              <p className="text-xs text-gray-500 mt-1">8-20 characters, uppercase, number, special character</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1" style={{ color: '#3C3C3C' }}>Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                className="w-full px-3 py-2 border-2 rounded-lg focus:outline-none text-sm"
                style={{ borderColor: '#E5E5E5' }}
                onFocus={(e) => e.target.style.borderColor = '#FF6600'}
                onBlur={(e) => e.target.style.borderColor = '#E5E5E5'}
                required
              />
            </div>

            <div className="mb-4 space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="emailNotifications"
                  checked={formData.emailNotifications}
                  onChange={handleChange}
                  className="mr-2"
                />
                <span className="text-sm" style={{ color: '#3C3C3C' }}>Receive email notifications</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="smsNotifications"
                  checked={formData.smsNotifications}
                  onChange={handleChange}
                  className="mr-2"
                />
                <span className="text-sm" style={{ color: '#3C3C3C' }}>Receive text notifications</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full text-white py-3 rounded-xl font-bold hover:opacity-90 transition-opacity disabled:bg-gray-400 shadow-lg"
              style={{ backgroundColor: '#FF6600' }}
            >
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <p className="text-sm" style={{ color: '#3C3C3C' }}>
              Already have an account?{' '}
              <button
                onClick={() => setAuthScreen('signin')}
                className="font-bold hover:underline"
                style={{ color: '#8BC53F' }}
              >
                Sign In
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const PaymentMethodForm = ({ userId, onSuccess, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setProcessing(true);

    if (!stripe || !elements) {
      return;
    }

    const cardElement = elements.getElement(CardElement);

    // Create payment method with Stripe
    const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
      type: 'card',
      card: cardElement,
    });

    if (stripeError) {
      setError(stripeError.message);
      setProcessing(false);
      return;
    }

    // Save payment method to database
    const { error: dbError } = await supabase
      .from('payment_methods')
      .insert({
        user_id: userId,
        stripe_payment_method_id: paymentMethod.id,
        card_brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        exp_month: paymentMethod.card.exp_month,
        exp_year: paymentMethod.card.exp_year,
        is_default: false
      });

    if (dbError) {
      setError('Failed to save payment method: ' + dbError.message);
      setProcessing(false);
      return;
    }

    setProcessing(false);
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Card Details
        </label>
        <div className="border border-gray-300 rounded-lg p-3">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#424770',
                  '::placeholder': {
                    color: '#aab7c4',
                  },
                },
                invalid: {
                  color: '#9e2146',
                },
              },
            }}
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-medium hover:bg-gray-300"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || processing}
          className="flex-1 bg-red-600 text-white py-3 rounded-lg font-medium hover:bg-red-700 disabled:bg-gray-400"
        >
          {processing ? 'Saving...' : 'Add Card'}
        </button>
      </div>
    </form>
  );
};

const AccountScreen = ({ user, handleSignOut, setScreen }) => {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [profile, setProfile] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [editFormData, setEditFormData] = useState({
    firstName: '',
    lastName: '',
    mobileNumber: '',
    zipCode: ''
  });

  useEffect(() => {
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (!error && data) {
        setProfile(data);
        setEditFormData({
          firstName: data.first_name || '',
          lastName: data.last_name || '',
          mobileNumber: data.mobile_number || '',
          zipCode: data.zip_code || ''
        });
      }
    };
    
    const fetchPaymentMethods = async () => {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        setPaymentMethods(data);
      }
    };
    
    fetchProfile();
    fetchPaymentMethods();
  }, [user.id]);

  const handleDeletePaymentMethod = async (paymentMethodId) => {
    if (!window.confirm('Are you sure you want to delete this payment method?')) {
      return;
    }

    const { error } = await supabase
      .from('payment_methods')
      .delete()
      .eq('id', paymentMethodId);

    if (!error) {
      setPaymentMethods(paymentMethods.filter(pm => pm.id !== paymentMethodId));
    } else {
      alert('Error deleting payment method: ' + error.message);
    }
  };

  const handleSetDefaultPayment = async (paymentMethodId) => {
    await supabase
      .from('payment_methods')
      .update({ is_default: false })
      .eq('user_id', user.id);

    const { error } = await supabase
      .from('payment_methods')
      .update({ is_default: true })
      .eq('id', paymentMethodId);

    if (!error) {
      setPaymentMethods(paymentMethods.map(pm => ({
        ...pm,
        is_default: pm.id === paymentMethodId
      })));
    }
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSaveProfile = async () => {
    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: editFormData.firstName,
        last_name: editFormData.lastName,
        mobile_number: editFormData.mobileNumber,
        zip_code: editFormData.zipCode
      })
      .eq('id', user.id);

    if (!error) {
      setProfile({
        ...profile,
        first_name: editFormData.firstName,
        last_name: editFormData.lastName,
        mobile_number: editFormData.mobileNumber,
        zip_code: editFormData.zipCode
      });
      setShowEditModal(false);
      alert('Profile updated successfully!');
    } else {
      alert('Error updating profile: ' + error.message);
    }
  };
  
  const handleDeleteAccount = async () => {
    if (!window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase.rpc('delete_user');
      
      if (error) {
        alert('Error deleting account: ' + error.message);
        return;
      }

      await handleSignOut();
      alert('Account successfully deleted.');
      
    } catch (error) {
      alert('Error deleting account: ' + error.message);
    }
  };

  const displayName = profile?.first_name && profile?.last_name 
    ? `${profile.first_name} ${profile.last_name}`
    : 'User';

  const getCardIcon = (brand) => {
    const brandLower = brand.toLowerCase();
    if (brandLower.includes('visa')) return '💳';
    if (brandLower.includes('mastercard')) return '💳';
    if (brandLower.includes('amex')) return '💳';
    if (brandLower.includes('discover')) return '💳';
    return '💳';
  };

  return (
    <div className="p-4 min-h-screen" style={{ 
      backgroundImage: `url("${getImageUrl('app-assets', 'hd_green_texture.png')}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      position: 'relative'
    }}>
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Account</h2>
      
      <div className="bg-white border border-gray-200 p-4 rounded-lg mb-4">
        <div className="flex items-center mb-3">
          <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="ml-4 flex-1">
            <p className="font-bold text-gray-900 text-lg">{displayName}</p>
            <p className="text-sm text-gray-600">{user.email}</p>
          </div>
        </div>
        <button 
          onClick={() => setShowEditModal(true)}
          className="text-sm font-medium hover:underline"
                          style={{ color: '#8BC53F' }}
        >
          Edit Profile
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gradient-to-br from-red-500 to-red-600 text-white p-4 rounded-lg">
          <p className="text-sm opacity-90">Lifetime Savings</p>
          <p className="text-2xl font-bold">$127.50</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-4 rounded-lg">
          <p className="text-sm opacity-90">Total Orders</p>
          <p className="text-2xl font-bold">48</p>
        </div>
      </div>

      <section className="mb-4">
        <h3 className="font-bold text-lg text-gray-800 mb-3">Payment Methods</h3>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {paymentMethods.length > 0 ? (
            <>
              {paymentMethods.map((pm) => (
                <div key={pm.id} className="p-4 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center flex-1">
                    <div className="text-2xl mr-3">{getCardIcon(pm.card_brand)}</div>
                    <div className="flex-1">
                      <p className="font-medium capitalize">{pm.card_brand} •••• {pm.last4}</p>
                      <p className="text-sm text-gray-600">Expires {pm.exp_month}/{pm.exp_year}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {pm.is_default ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Default</span>
                    ) : (
                      <button
                        onClick={() => handleSetDefaultPayment(pm.id)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Set Default
                      </button>
                    )}
                    <button
                      onClick={() => handleDeletePaymentMethod(pm.id)}
                      className="text-red-600 hover:underline text-sm"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="p-4 text-center text-gray-500">
              No payment methods added yet
            </div>
          )}
          <button 
            onClick={() => setShowPaymentModal(true)}
            className="w-full p-4 text-red-600 font-medium hover:bg-gray-50 transition-colors text-left"
          >
            + Add Payment Method
          </button>
        </div>
      </section>

      <section className="mb-4">
        <h3 className="font-bold text-lg text-gray-800 mb-3">Settings</h3>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <button 
  onClick={() => setScreen('order-history')}  // Navigate to new screen
  className="w-full p-4 text-left border-b border-gray-200 hover:bg-gray-50 transition-colors flex justify-between items-center"
>
  <span className="font-medium">Order History</span>
  <span className="text-gray-400">→</span>
</button>
          <button className="w-full p-4 text-left border-b border-gray-200 hover:bg-gray-50 transition-colors flex justify-between items-center">
            <span className="font-medium">Notification Preferences</span>
            <span className="text-gray-400">→</span>
          </button>
          <button className="w-full p-4 text-left border-b border-gray-200 hover:bg-gray-50 transition-colors flex justify-between items-center">
            <span className="font-medium">Favorite Stores</span>
            <span className="text-gray-400">→</span>
          </button>
          <button className="w-full p-4 text-left hover:bg-gray-50 transition-colors flex justify-between items-center">
            <span className="font-medium">Help & Support</span>
            <span className="text-gray-400">→</span>
          </button>
        </div>
      </section>

      <div className="bg-gray-50 p-4 rounded-lg mb-4">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>App Version</span>
          <span className="font-medium">2.4.1</span>
        </div>
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Member Since</span>
          <span className="font-medium">January 2024</span>
        </div>
        <div className="flex justify-between text-sm text-gray-600">
          <span>Customer ID</span>
          <span className="font-medium">#JF-{user.id.substring(0, 8)}</span>
        </div>
      </div>

      <button
        onClick={handleSignOut}
        className="w-full bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 transition-colors mb-2"
      >
        Sign Out
      </button>

      <div className="text-center">
        <button 
          onClick={handleDeleteAccount}
          className="text-gray-500 text-sm hover:underline"
        >
          Delete Account
        </button>
      </div>

      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-xl font-bold mb-4">Add Payment Method</h3>
            <Elements stripe={stripePromise}>
              <PaymentMethodForm
                userId={user.id}
                onSuccess={() => {
                  setShowPaymentModal(false);
                  supabase
                    .from('payment_methods')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .then(({ data }) => {
                      if (data) setPaymentMethods(data);
                    });
                }}
                onCancel={() => setShowPaymentModal(false)}
              />
            </Elements>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-xl font-bold mb-4">Edit Profile</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
              <input type="text" name="firstName" value={editFormData.firstName} onChange={handleEditChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
              <input type="text" name="lastName" value={editFormData.lastName} onChange={handleEditChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Mobile Number</label>
              <input type="tel" name="mobileNumber" value={editFormData.mobileNumber} onChange={handleEditChange} placeholder="(555) 123-4567" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Zip Code</label>
              <input type="text" name="zipCode" value={editFormData.zipCode} onChange={handleEditChange} maxLength="5" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowEditModal(false)} className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-medium hover:bg-gray-300 transition-colors">Cancel</button>
              <button onClick={handleSaveProfile} className="flex-1 bg-red-600 text-white py-3 rounded-lg font-medium hover:bg-red-700 transition-colors">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const OrderHistoryScreen = ({ user, setScreen, stores, setTrackingOrderId }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 5;

  const fetchOrders = async (pageNum = 0) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        store:stores(name)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(pageNum * pageSize, (pageNum + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching orders:', error);
      alert('Failed to load order history');
    } else {
      if (pageNum === 0) {
        setOrders(data || []);  // Reset for first page
      } else {
        setOrders(prev => [...prev, ...(data || [])]);  // Append for load more
      }
      setHasMore(data && data.length === pageSize);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders(0);  // Initial load
  }, [user.id]);

const formatDate = (dateStr) => {
  return new Date(dateStr).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    hour: 'numeric', 
    minute: '2-digit' 
  });
};

  const getStatusBadge = (status) => {
    const badges = {
    placed: { text: 'Placed', color: 'bg-yellow-100 text-yellow-800' },
    preparing: { text: 'Preparing', color: 'bg-blue-100 text-blue-800' },
    ready: { text: 'Ready for Pickup', color: 'bg-green-100 text-green-800' },
    completed: { text: 'Completed', color: 'bg-gray-100 text-gray-800' },
    };
    return badges[status] || { text: 'Unknown', color: 'bg-gray-100 text-gray-800' };
  };

  if (orders.length === 0 && !loading) {
    return (
      <div className="p-4 text-center">
        <h2 className="text-xl font-bold mb-4">Order History</h2>
        <p className="text-gray-600 mb-4">No orders yet. Start shopping!</p>
        <button 
          onClick={() => setScreen('products')}
          className="bg-red-600 text-white py-3 px-6 rounded-lg"
        >
          Shop Now
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 min-h-screen" style={{ 
      backgroundImage: `url("${getImageUrl('app-assets', 'hd_green_texture.png')}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      position: 'relative'
    }}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Order History</h2>
        <button 
          onClick={() => setScreen('account')}
          className="text-gray-500 hover:text-gray-700"
        >
          ← Back
        </button>
      </div>

      <div className="space-y-4 mb-6">
        {orders.map((order) => {
          const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
          const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

          return (
            <div key={order.id} className="bg-white border border-gray-200 rounded-lg p-4">
              {/* Header: Date, Store, Status */}
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-bold text-gray-900">{formatDate(order.created_at)}</p>
                  <p className="text-sm text-gray-600">{order.store?.name || `Store #${order.store_id}`}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(order.status).color}`}>
                  {getStatusBadge(order.status).text}
                </span>
              </div>

              {/* Items Summary */}
              <div className="mb-3">
                <p className="text-sm text-gray-600 mb-2">Items: {totalItems}</p>
                <div className="space-y-1 max-h-20 overflow-y-auto">
                  {items.slice(0, 3).map((item, idx) => (  // Show up to 3 items
                    <div key={idx} className="flex justify-between text-sm">
                      <span>{item.name} (x{item.quantity})</span>
                      <span>${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                  {items.length > 3 && (
                    <p className="text-xs text-gray-500">...and {items.length - 3} more</p>
                  )}
                </div>
              </div>

              {/* Receipt Totals */}
               <div className="border-t border-gray-200 pt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>${order.subtotal?.toFixed(2) || '0.00'}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span className="font-medium">Discounts</span>
                    <span className="font-medium">-${order.discount?.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Tax</span>
                  <span>${order.tax?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span className="text-green-600">${order.total?.toFixed(2) || '0.00'}</span>
                </div>
                {order.pickup_time && (
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Pickup:</span>
                    <span>{order.pickup_time === 'asap' ? 'ASAP' : new Date(order.pickup_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                )}
                {order.special_instructions && (
                  <div className="text-xs text-gray-500 mt-1">
                    Notes: {order.special_instructions}
                  </div>
                )}
              </div>
{order.status !== 'completed' && (
  <div className="border-t border-gray-200 pt-3 mt-3">
    <button
      onClick={() => {
        setTrackingOrderId(order.id);
        setScreen('order-tracking');
      }}
      className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"
    >
      📍 Track this order
    </button>
  </div>
)}
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button 
          onClick={() => {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchOrders(nextPage);
          }}
          disabled={loading}
          className="w-full py-3 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Load More Orders'}
        </button>
      )}
    </div>
  );
};

const OrderSuccessScreen = ({ setScreen }) => {
  const [orderId, setOrderId] = useState(null);
  const [orderDetails, setOrderDetails] = useState(null);

  useEffect(() => {
    const fetchOrder = async () => {
      if (!window.currentOrderId) {
        setScreen('home');
        return;
      }

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          store:stores(id, name, address, phone)
        `)
        .eq('id', window.currentOrderId)
        .single();

      if (!error && data) {
        data.items = Array.isArray(data.items) ? data.items : JSON.parse(data.items || '[]');
        setOrderDetails(data);
        setOrderId(window.currentOrderId);
      }
    };

    fetchOrder();

    // Auto-exit to track order after 2 seconds
    const autoExitTimer = setTimeout(() => {
      setScreen('order-tracking');
    }, 2000);

    return () => clearTimeout(autoExitTimer);
  }, []);

  const formatPickupTime = (time, createdAt) => {
    if (time === 'asap') {
      // Calculate 15 minutes after order creation
      const estimatedTime = new Date(new Date(createdAt).getTime() + 15 * 60 * 1000);
      return estimatedTime.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit' 
      });
    }
    return new Date(time).toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="p-4 min-h-screen bg-gradient-to-b from-green-50 to-white relative">
      {/* Faded grey "x" button in top-right */}
      <button
        onClick={() => setScreen('order-tracking')}
        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl font-bold opacity-70 transition-opacity"
      >
        ×
      </button>

      {/* Success Animation */}
      <div className="text-center mb-6 pt-8">
        <div className="w-24 h-24 bg-green-500 rounded-full mx-auto mb-4 flex items-center justify-center animate-bounce">
          <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Order Placed!</h2>
        <p className="text-gray-600 text-lg">Your order is confirmed</p>
        {orderId && (
          <p className="text-sm text-gray-500 mt-2">Order #{orderId.substring(0, 8).toUpperCase()}</p>
        )}
      </div>

      {orderDetails && (
        <>
          {/* Order Summary Card */}
          <div className="bg-white rounded-xl shadow-lg p-5 mb-4 border border-gray-100">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">🏪</span>
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900">{orderDetails.store?.name}</h3>
                <p className="text-sm text-gray-600">{orderDetails.store?.address}</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 mb-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Pickup Time</span>
                <span className="text-sm font-bold text-gray-900">
                  {formatPickupTime(orderDetails.pickup_time, orderDetails.created_at)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Items</span>
                <span className="text-sm font-bold text-gray-900">
                  {orderDetails.items.reduce((sum, item) => sum + item.quantity, 0)} items
                </span>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-3">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-gray-900">Total Paid</span>
                <span className="text-lg font-bold text-green-600">
                  ${orderDetails.total?.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Status Progress Card */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-5 mb-4 text-white">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm opacity-90 mb-1">Current Status</p>
                <p className="text-xl font-bold">Order Placed</p>
              </div>
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
              </div>
            </div>
            <p className="text-sm opacity-90 mb-4">
              We've notified {orderDetails.store?.name} about your order
            </p>
            
            {/* Progress Steps */}
            <div className="flex justify-between items-center">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center mb-1">
                  <span className="text-blue-600 text-lg">✓</span>
                </div>
                <span className="text-xs">Placed</span>
              </div>
              <div className="flex-1 h-1 bg-white bg-opacity-30 mx-2"></div>
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 bg-white bg-opacity-30 rounded-full flex items-center justify-center mb-1">
                  <span className="text-xs">2</span>
                </div>
                <span className="text-xs">Preparing</span>
              </div>
              <div className="flex-1 h-1 bg-white bg-opacity-30 mx-2"></div>
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 bg-white bg-opacity-30 rounded-full flex items-center justify-center mb-1">
                  <span className="text-xs">3</span>
                </div>
                <span className="text-xs">Ready</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <button
            onClick={() => setScreen('order-tracking')}
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg mb-3 hover:bg-blue-700 transition-colors shadow-lg"
          >
            Track Order
          </button>
          
          <button
            onClick={() => setScreen('home')}
            className="w-full bg-white border-2 border-gray-300 text-gray-700 py-4 rounded-xl font-medium hover:bg-gray-50 transition-colors"
          >
            Back to Home
          </button>

          {/* Help Section */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 mb-2">Need help with your order?</p>
            <a 
              href={`tel:${orderDetails.store?.phone || '555-0100'}`}
              className="text-blue-600 font-medium hover:underline"
            >
              Call {orderDetails.store?.name}
            </a>
          </div>
        </>
      )}
    </div>
  );
};

const OrderTrackingScreen = ({ activeOrder, setScreen, trackingOrderId }) => {
  const [order, setOrder] = useState(null);

  useEffect(() => {
    const orderId = trackingOrderId || activeOrder?.id;
    
    if (!orderId) {
      setScreen('home');
      return;
    }
    
    const fetchOrder = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          store:stores(id, name, address)
        `)
        .eq('id', orderId)
        .single();
      if (!error && data) {
        data.items = Array.isArray(data.items) ? data.items : JSON.parse(data.items || '[]');
        setOrder(data);
      }
    };
    
    fetchOrder();
    
    // Subscribe to order updates
    const channel = supabase
      .channel(`order-${orderId}`)
      .on('postgres_changes', 
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'orders',
          filter: `id=eq.${orderId}`
        }, 
        (payload) => {
          const updatedOrder = payload.new;
          updatedOrder.items = Array.isArray(updatedOrder.items) 
            ? updatedOrder.items 
            : JSON.parse(updatedOrder.items || '[]');
          setOrder(updatedOrder);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      window.currentOrderId = null;
    };
}, [activeOrder, trackingOrderId, setScreen]);

  if (!order) {
    return (
      <div className="p-4 text-center">
        <p>Loading order details...</p>
      </div>
    );
  }

  const getStatusStep = (status) => {
    switch(status) {
      case 'placed': return 1;
      case 'preparing': return 2;
      case 'ready': return 3;
      default: return 0;
    }
  };

  const currentStep = getStatusStep(order.status);

const formatPickupTime = (time, createdAt) => {
    if (time === 'asap') {
      // Calculate 15 minutes after order creation
      const estimatedTime = new Date(new Date(createdAt).getTime() + 15 * 60 * 1000);
      return estimatedTime.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit' 
      });
    }
    return new Date(time).toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit' 
    });
  };

  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="p-4 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button 
          onClick={() => setScreen('home')}
          className="text-gray-600 hover:text-gray-900"
        >
          ← Back
        </button>
        <h2 className="text-xl font-bold text-gray-900">Track Order</h2>
        <div className="w-6"></div>
      </div>

      {/* Status Timeline */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-4">
        <div className="relative">
          {/* Vertical Line */}
          <div className="absolute left-6 top-8 bottom-8 w-1 bg-gray-200">
            <div 
              className="bg-gradient-to-b from-green-500 to-blue-500 transition-all duration-500"
              style={{ 
                height: currentStep === 1 ? '0%' : currentStep === 2 ? '50%' : '100%',
                width: '100%'
              }}
            ></div>
          </div>

          {/* Step 1: Placed */}
          <div className="relative flex items-start mb-8">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center z-10 ${
              currentStep >= 1 ? 'bg-green-500' : 'bg-gray-200'
            }`}>
              {currentStep >= 1 ? (
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className="text-gray-400 text-lg">1</span>
              )}
            </div>
            <div className="ml-4 flex-1">
              <h3 className="font-bold text-gray-900">Order Placed</h3>
              <p className="text-sm text-gray-600">We've received your order</p>
              <p className="text-xs text-gray-500 mt-1">{formatTime(order.created_at)}</p>
            </div>
          </div>

          {/* Step 2: Preparing */}
          <div className="relative flex items-start mb-8">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center z-10 ${
              currentStep >= 2 ? 'bg-blue-500' : 'bg-gray-200'
            }`}>
              {currentStep >= 2 ? (
                currentStep === 2 ? (
                  <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )
              ) : (
                <span className="text-gray-400 text-lg">2</span>
              )}
            </div>
            <div className="ml-4 flex-1">
              <h3 className="font-bold text-gray-900">Preparing Order</h3>
              <p className="text-sm text-gray-600">
                {currentStep >= 2 ? 'Your order is being prepared' : 'Waiting for store to begin'}
              </p>
              {currentStep === 2 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span className="text-xs text-blue-600 font-medium">In Progress</span>
                </div>
              )}
            </div>
          </div>

          {/* Step 3: Ready */}
          <div className="relative flex items-start">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center z-10 ${
              currentStep >= 3 ? 'bg-green-500 ring-4 ring-green-100' : 'bg-gray-200'
            }`}>
              {currentStep >= 3 ? (
                <span className="text-2xl">🎉</span>
              ) : (
                <span className="text-gray-400 text-lg">3</span>
              )}
            </div>
            <div className="ml-4 flex-1">
              <h3 className="font-bold text-gray-900">Ready for Pickup</h3>
              <p className="text-sm text-gray-600">
                {currentStep >= 3 ? 'Your order is ready!' : 'We\'ll notify you when ready'}
              </p>
              {currentStep >= 3 && (
                <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-2">
                  <p className="text-sm text-green-800 font-medium">
                    Head to {order.store?.name} to pick up your order!
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Order Details */}
      <div className="bg-white rounded-xl shadow-lg p-5 mb-4">
        <h3 className="font-bold text-lg mb-3">Order Details</h3>
        
        <div className="space-y-3 mb-4">
          {order.items.map((item, idx) => (
            <div key={idx} className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <ProductImageDisplay 
  product={item} 
  size="small"
/>
                <div>
                  <p className="font-medium text-sm">{item.name}</p>
                  <p className="text-xs text-gray-600">Qty: {item.quantity}</p>
                </div>
              </div>
              <span className="font-medium text-sm">
                ${(item.price * item.quantity).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-200 pt-3 space-y-2">
  <div className="flex justify-between text-sm">
    <span className="text-gray-600">Subtotal</span>
    <span className="font-medium">${order.subtotal?.toFixed(2)}</span>
  </div>
  {order.discount > 0 && (
    <div className="flex justify-between text-sm text-orange-600">
      <span className="font-medium">Discounts</span>
      <span className="font-medium">-${order.discount?.toFixed(2)}</span>
    </div>
  )}
  <div className="flex justify-between text-sm">
    <span className="text-gray-600">Tax</span>
    <span className="font-medium">${order.tax?.toFixed(2)}</span>
  </div>
  <div className="flex justify-between font-bold pt-2 border-t border-gray-200">
    <span>Total</span>
    <span className="text-green-600">${order.total?.toFixed(2)}</span>
  </div>
</div>
      </div>

      {/* Store Info */}
      <div className="bg-white rounded-xl shadow-lg p-5 mb-4">
        <h3 className="font-bold text-lg mb-3">Pickup Location</h3>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-2xl">🏪</span>
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-gray-900">{order.store?.name}</h4>
            <p className="text-sm text-gray-600">{order.store?.address}</p>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-gray-600">Pickup:</span>
              <span className="font-medium text-gray-900">
                {formatPickupTime(order.pickup_time, order.created_at)}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors">
            Get Directions
          </button>
          <a 
            href={`tel:${order.store?.phone || '555-0100'}`}
            className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-medium hover:bg-gray-300 transition-colors text-center"
          >
            Call Store
          </a>
        </div>
      </div>

      {/* Special Instructions */}
      {order.special_instructions && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
          <h4 className="font-medium text-yellow-900 mb-1">Special Instructions</h4>
          <p className="text-sm text-yellow-800">{order.special_instructions}</p>
        </div>
      )}

      {/* Order ID */}
      <div className="text-center text-sm text-gray-500">
        Order ID: #{order.id.substring(0, 8).toUpperCase()}
      </div>
    </div>
  );
};

const StoresScreen = ({ stores, setScreen, selectedStore, setSelectedStore, mapCenter, setMapCenter, zoom, setZoom, getUserLocation, isLocating, userLocation, getCurrentHours, getDayLabel }) => {
  const [viewMode, setViewMode] = useState('list');
  
  return (
    <div className="p-4 min-h-screen" style={{ 
      backgroundImage: `url("${getImageUrl('app-assets', 'hd_green_texture.png')}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      position: 'relative'
    }}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Store Locations</h2>
        <div className="flex gap-2">
          <button 
            onClick={() => setViewMode('list')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${viewMode === 'list' ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700'} hover:bg-opacity-90 transition-colors`}
          >
            List View
          </button>
          <button 
            onClick={() => setViewMode('map')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${viewMode === 'map' ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700'} hover:bg-opacity-90 transition-colors`}
          >
            Map View
          </button>
        </div>
      </div>
      
      <button
        onClick={getUserLocation}
        disabled={isLocating}
        className="mb-4 w-full bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 flex items-center justify-center gap-2"
      >
        <MapPin className="w-5 h-5" />
        {isLocating ? 'Finding your location...' : 'Find Nearest Store'}
      </button>
      
      {userLocation && (
        <p className="text-green-600 text-sm mb-4 text-center">
          ✓ Location detected - stores sorted by distance
        </p>
      )}
      
      {viewMode === 'map' ? (
        <MapView 
          stores={stores} 
          selectedStore={selectedStore} 
          setSelectedStore={setSelectedStore}
          userLocation={userLocation}
          getCurrentHours={getCurrentHours}
          getDayLabel={getDayLabel}
        />
      ) : (
        <div className="space-y-4">
          {stores.map((store) => (
            <div key={store.id} className={`bg-white border-2 p-4 rounded-lg ${selectedStore && selectedStore.id === store.id ? 'border-red-300 bg-red-50' : 'border-gray-200'} hover:shadow-md transition-shadow`}>
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-gray-900">{store.name}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-green-600 font-medium">{store.status}</span>
                  {selectedStore && selectedStore.id === store.id && (
                    <span className="text-xs bg-red-600 text-white px-2 py-1 rounded">
                      SELECTED
                    </span>
                  )}
                </div>
              </div>
              <p className="text-gray-600 mb-2">{store.address}</p>
              <div className="mb-3">
                <span className="text-sm text-gray-500">{store.distance}</span>
              </div>
              
              <div className="flex gap-2 mb-3">
                {store.store_categories && store.store_categories.map(cat => (
                  cat.categories.name === 'Pizza' && (
                    <span key={cat.categories.id} className="text-xs bg-orange-100 text-orange-600 px-2 py-1 rounded">
                      {cat.categories.icon} {cat.categories.name}
                    </span>
                  )
                ))}
                {store.store_categories && store.store_categories.map(cat => (
                  cat.categories.name === 'Tobacco' && (
                    <span key={cat.categories.id} className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">
                      {cat.categories.icon} {cat.categories.name} Available
                    </span>
                  )
                ))}
              </div>
              
              <div className="flex justify-between items-center">
                <div className="space-x-2">
                  <button className="text-blue-600 text-sm hover:underline">Directions</button>
                  <button className="text-red-600 text-sm hover:underline">Call Store</button>
                </div>
                {(!selectedStore || selectedStore.id !== store.id) && (
                  <button 
                    onClick={() => setSelectedStore(store)}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 transition-colors"
                  >
                    Select Store
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MapView = ({ stores, selectedStore, setSelectedStore, userLocation, getCurrentHours, getDayLabel }) => {
  const mapRef = React.useRef(null);
  const mapInstanceRef = React.useRef(null);
  const markersRef = React.useRef([]);

  const updateMapMarkers = () => {
    if (!mapInstanceRef.current || !window.L) return;

    const L = window.L;
    const map = mapInstanceRef.current;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    if (userLocation) {
      const userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 8,
        fillColor: '#3b82f6',
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      }).addTo(map);
      
      userMarker.bindPopup('<b>Your Location</b>');
      markersRef.current.push(userMarker);
    }

    stores.forEach(store => {
  if (!store.lat || !store.lng) return;

  const isSelected = selectedStore && selectedStore.id === store.id;
  const hours = getCurrentHours(store);
  const dayLabel = getDayLabel();

  const marker = L.marker([store.lat, store.lng], {
    icon: L.divIcon({
      className: 'custom-marker',
      html: `<div style="background-color: ${isSelected ? '#dc2626' : '#2563eb'}; 
               width: 30px; height: 30px; border-radius: 50% 50% 50% 0; 
               transform: rotate(-45deg); border: 2px solid white; 
               box-shadow: 0 2px 5px rgba(0,0,0,0.3); 
               display: flex; align-items: center; justify-content: center;">
               <span style="transform: rotate(45deg); color: white; font-size: 16px;">📍</span>
             </div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 30]
    })
  }).addTo(map);

  // Build popup content dynamically
  const popupDiv = L.DomUtil.create('div');
  popupDiv.style.minWidth = '200px';
  popupDiv.innerHTML = `
    <h3 style="font-weight: bold; margin-bottom: 4px;">${store.name}</h3>
    <p style="font-size: 12px; color: #666; margin-bottom: 4px;">${store.address}</p>
    <p style="font-size: 12px; color: #2563eb; font-weight: 600; margin-bottom: 4px;">
  ${store.distance ? store.distance : 'Distance not set'}
</p>
    <div style="background-color: #f3f4f6; padding: 6px; border-radius: 4px; margin-bottom: 4px;">
      <p style="font-size: 10px; color: #666; font-weight: 600; margin-bottom: 2px;">${dayLabel} Hours:</p>
      <p style="font-size: 12px; color: #111; font-weight: bold;">${hours}</p>
    </div>
    <p style="font-size: 14px; margin-bottom: 4px;">${store.store_categories?.map(sc => sc.categories.icon).join(' ') || ''}</p>
    <p style="font-size: 12px; color: ${store.status?.includes('Open') ? '#16a34a' : '#dc2626'}; font-weight: 600; margin-bottom: 8px;">${store.status || 'Status unknown'}</p>
  `;

 if (!isSelected) {
    const button = L.DomUtil.create('button', '', popupDiv);
    button.textContent = 'Select Store';
    button.setAttribute('data-store-id', store.id);
    Object.assign(button.style, {
      backgroundColor: '#dc2626',
      color: 'white',
      padding: '6px 12px',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      width: '100%',
      fontSize: '12px',
      fontWeight: '600'
    });

    // Use L.DomEvent to properly handle the click
    L.DomEvent.disableClickPropagation(button);
    L.DomEvent.on(button, 'click', (e) => {
      L.DomEvent.stop(e);
      
      // Store reference before closing popup
      const storeToSelect = store;
      
      // Close all popups first
      map.closePopup();
      
      // Queue state update after Leaflet cleanup
      requestAnimationFrame(() => {
        setSelectedStore(storeToSelect);
      });
    });
  } else {
    const selectedDiv = L.DomUtil.create('div', '', popupDiv);
    selectedDiv.textContent = '✓ Selected';
    Object.assign(selectedDiv.style, {
      backgroundColor: '#dcfce7',
      color: '#16a34a',
      padding: '6px',
      borderRadius: '6px',
      textAlign: 'center',
      fontSize: '12px',
      fontWeight: '600'
    });
  }

  marker.bindPopup(popupDiv);
  marker.on('click', () => marker.openPopup());
  markersRef.current.push(marker);
});

    if (markersRef.current.length > 0) {
      const group = L.featureGroup(markersRef.current);
      map.fitBounds(group.getBounds().pad(0.1));
    }
  };

  React.useEffect(() => {
    
    const loadLeaflet = () => {
      if (window.L) {
        initMap();
        return;
      }
    };

    const initMap = () => {
      if (!window.L || !mapRef.current || mapInstanceRef.current) return;

      const L = window.L;
      
      let initialLat = 39.8283;
      let initialLng = -98.5795;
      let initialZoom = 4;
      
      if (stores.length > 0) {
        const validStores = stores.filter(s => s.lat && s.lng);
        if (validStores.length > 0) {
          initialLat = validStores.reduce((sum, s) => sum + s.lat, 0) / validStores.length;
          initialLng = validStores.reduce((sum, s) => sum + s.lng, 0) / validStores.length;
          initialZoom = 10;
        }
      }
      
      const map = L.map(mapRef.current, {
        minZoom: 3,
        maxZoom: 18,
        zoomControl: true,
	attributionControl: false
      }).setView([initialLat, initialLng], initialZoom);
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '',
        maxZoom: 18,
        minZoom: 3
      }).addTo(map);

      updateMapMarkers();
    };

    loadLeaflet();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    if (mapInstanceRef.current && window.L) {
      updateMapMarkers();
    }
  }, [stores, selectedStore, userLocation]);

  window.selectStore = (storeId) => {
    const store = stores.find(s => s.id === storeId);
    if (store) setSelectedStore(store);
  };

  return (
    <div>
      <div 
        ref={mapRef} 
        style={{ height: '500px', width: '100%', borderRadius: '8px' }}
        className="border border-gray-300"
      ></div>
      
      <div className="mt-4 grid grid-cols-2 gap-2">
        {stores.map((store) => (
          <button
            key={store.id}
            onClick={() => {
              if (mapInstanceRef.current && store.lat && store.lng) {
                mapInstanceRef.current.setView([store.lat, store.lng], 14);
              }
            }}
            className={`p-2 rounded-lg text-xs font-medium ${selectedStore && selectedStore.id === store.id ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700'} hover:bg-opacity-90 transition-colors`}
          >
            📍 {store.name.replace('Jack Flash ', '')}
          </button>
        ))}
      </div>
    </div>
  );
};
const StoreManagerApp = ({ user, handleSignOut }) => {
  const [assignedStores, setAssignedStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [orders, setOrders] = useState([]);
  const [completedOrders, setCompletedOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeTab, setActiveTab] = useState('orders'); // 'orders', 'completed', 'products', 'settings'
  const [alertAudio, setAlertAudio] = useState(null);

  // Initialize audio
  useEffect(() => {
    const audio = new Audio(getImageUrl('app-assets', 'order-alert.mp3'));
    audio.loop = true; // Loop continuously
    audio.volume = 0.7; // Adjust volume (0.0 to 1.0)
    setAlertAudio(audio);

    return () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
  }, []);

  // Play/stop alert based on placed orders
  useEffect(() => {
    const hasPlacedOrders = orders.some(order => order.status === 'placed');
    
    if (alertAudio) {
      if (hasPlacedOrders) {
        // Play alert if there are any placed orders
        alertAudio.play().catch(err => {
          console.log('Audio play failed:', err);
          // Note: Browser may block autoplay until user interacts with page
        });
      } else {
        // Stop alert when no placed orders
        alertAudio.pause();
        alertAudio.currentTime = 0; // Reset to beginning
      }
    }
  }, [orders, alertAudio]);

  // Fetch stores this manager is assigned to
  useEffect(() => {
    const fetchAssignedStores = async () => {
      console.log('Fetching stores for manager:', user.email);
      
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .eq('manager_email', user.email);

      console.log('Stores query result:', { data, error });

      if (data && data.length > 0) {
        setAssignedStores(data);
        setSelectedStore(data[0]);
      } else {
        console.log('No stores found for this manager');
      }
    };

    fetchAssignedStores();
  }, [user.email]);

  // Fetch active orders for selected store
  useEffect(() => {
    if (!selectedStore) return;

    const fetchOrders = async () => {
      console.log('Fetching active orders for store:', selectedStore.id);
      
      const { data, error } = await supabase
        .from('orders')
        .select('*, profiles(first_name, last_name, mobile_number)')
        .eq('store_id', selectedStore.id)
        .in('status', ['placed', 'preparing', 'ready'])
        .order('created_at', { ascending: true });

      console.log('Orders query result:', { data, error });

      if (error) {
        console.error('Error fetching orders:', error);
      } else if (data) {
        const ordersWithParsedItems = data.map(order => ({
          ...order,
          items: Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]')
        }));
        console.log('Parsed orders:', ordersWithParsedItems);
        setOrders(ordersWithParsedItems);
      }
    };

    fetchOrders();

    // Subscribe to order updates
    const channel = supabase
      .channel(`store-orders-${selectedStore.id}`)
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `store_id=eq.${selectedStore.id}`
        },
        () => {
          console.log('Order updated, refetching...');
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedStore]);

  // Fetch completed orders
  useEffect(() => {
    if (!selectedStore || activeTab !== 'completed') return;

    const fetchCompletedOrders = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, profiles(first_name, last_name, mobile_number)')
        .eq('store_id', selectedStore.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching completed orders:', error);
      } else if (data) {
        const ordersWithParsedItems = data.map(order => ({
          ...order,
          items: Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]')
        }));
        setCompletedOrders(ordersWithParsedItems);
      }
    };

    fetchCompletedOrders();
  }, [selectedStore, activeTab]);

  // Fetch store products
// Fetch store products with real-time updates
  useEffect(() => {
    if (!selectedStore || activeTab !== 'products') return;

    const fetchProducts = async () => {
      const { data: storeProducts, error } = await supabase
        .from('store_products')
        .select('*, products(*)')
        .eq('store_id', selectedStore.id)
        .order('product_id', { ascending: true });

      if (error) {
        console.error('Error fetching products:', error);
      } else if (storeProducts) {
        setProducts(storeProducts);
      }
    };

    fetchProducts();
  }, [selectedStore, activeTab]);

 const updateOrderStatus = async (orderId, newStatus) => {
    console.log('Updating order status:', orderId, 'to', newStatus);
    
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId);

    if (error) {
      console.error('Update error:', error);
      alert('Failed to update order: ' + error.message);
    } else {
      console.log('Update successful, updating local state');
      // If status is completed, remove from active orders
      if (newStatus === 'completed') {
        setOrders(orders.filter(order => order.id !== orderId));
      } else {
        // Otherwise update the status
        setOrders(orders.map(order => 
          order.id === orderId ? { ...order, status: newStatus } : order
        ));
      }
      console.log('Local state updated');
    }
  };

  const toggleProductAvailability = async (storeProduct, currentAvailability) => {
    console.log('Toggle called with:', {
      storeProduct,
      currentAvailability,
      store_id: storeProduct.store_id,
      product_id: storeProduct.product_id
    });
    
    const { data, error } = await supabase
      .from('store_products')
      .update({ available: !currentAvailability })
      .eq('store_id', storeProduct.store_id)
      .eq('product_id', storeProduct.product_id)
      .select();

    console.log('Update result:', { data, error });

    if (error) {
      console.error('Update error:', error);
      alert('Failed to update product: ' + error.message);
    } else {
      console.log('Update successful, updating local state');
      setProducts(products.map(p => 
        p.store_id === storeProduct.store_id && p.product_id === storeProduct.product_id 
          ? { ...p, available: !currentAvailability } 
          : p
      ));
    }
  };

  // Split active orders by status
  const placedOrders = orders.filter(o => o.status === 'placed');
  const preparingOrders = orders.filter(o => o.status === 'preparing');
  const readyOrders = orders.filter(o => o.status === 'ready');

  return (
    <div className="max-w-[1400px] mx-auto bg-gray-100 min-h-screen">
      {/* Header */}
      <div className="bg-orange-600 text-white p-4 sticky top-0 z-10 shadow-md">
        <div className="flex justify-between items-center mb-2">
          <JackFlashLogo size="small" />
          <button
            onClick={handleSignOut}
            className="text-sm bg-white bg-opacity-20 px-3 py-1 rounded hover:bg-opacity-30"
          >
            Sign Out
          </button>
        </div>
        <h1 className="text-xl font-bold">Order Management Portal</h1>
        {selectedStore && (
          <p className="text-sm opacity-90">{selectedStore.name}</p>
        )}
      </div>

      {/* Store Selector */}
      {assignedStores.length > 1 && (
        <div className="bg-white p-4 border-b">
          <label className="block text-sm font-medium mb-2">Select Store:</label>
          <select
            value={selectedStore?.id || ''}
            onChange={(e) => {
              const store = assignedStores.find(s => s.id === parseInt(e.target.value));
              setSelectedStore(store);
            }}
            className="w-full p-2 border rounded"
          >
            {assignedStores.map(store => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="bg-white border-b sticky top-[88px] z-10">
        <div className="flex">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex-1 py-3 px-4 font-medium text-sm transition-colors ${
              activeTab === 'orders'
                ? 'bg-orange-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Active Orders ({orders.length})
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`flex-1 py-3 px-4 font-medium text-sm transition-colors ${
              activeTab === 'completed'
                ? 'bg-orange-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Completed
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`flex-1 py-3 px-4 font-medium text-sm transition-colors ${
              activeTab === 'products'
                ? 'bg-orange-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Products
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-3 px-4 font-medium text-sm transition-colors ${
              activeTab === 'settings'
                ? 'bg-orange-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Settings
          </button>
        </div>
      </div>

      {/* Active Orders View - 3 Column Kanban (Tablet Optimized) */}
      {activeTab === 'orders' && (
        <div className="p-3">
          <div className="grid grid-cols-3 gap-3">
            {/* Placed Orders Column */}
            <div className="bg-yellow-50 rounded-lg p-3 min-h-[600px]">
              <h2 className="text-base font-bold mb-3 text-yellow-800 flex items-center gap-2 sticky top-0 bg-yellow-50 pb-2">
                📋 Placed ({placedOrders.length})
              </h2>
              <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-200px)]">
                {placedOrders.length === 0 ? (
                  <p className="text-sm text-gray-600 text-center py-8">No orders</p>
                ) : (
                  placedOrders.map(order => (
                    <CompactOrderCard
                      key={order.id}
                      order={order}
                      onUpdateStatus={updateOrderStatus}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Preparing Orders Column */}
            <div className="bg-blue-50 rounded-lg p-3 min-h-[600px]">
              <h2 className="text-base font-bold mb-3 text-blue-800 flex items-center gap-2 sticky top-0 bg-blue-50 pb-2">
                👨‍🍳 Preparing ({preparingOrders.length})
              </h2>
              <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-200px)]">
                {preparingOrders.length === 0 ? (
                  <p className="text-sm text-gray-600 text-center py-8">No orders</p>
                ) : (
                  preparingOrders.map(order => (
                    <CompactOrderCard
                      key={order.id}
                      order={order}
                      onUpdateStatus={updateOrderStatus}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Ready Orders Column */}
            <div className="bg-green-50 rounded-lg p-3 min-h-[600px]">
              <h2 className="text-base font-bold mb-3 text-green-800 flex items-center gap-2 sticky top-0 bg-green-50 pb-2">
                ✅ Ready ({readyOrders.length})
              </h2>
              <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-200px)]">
                {readyOrders.length === 0 ? (
                  <p className="text-sm text-gray-600 text-center py-8">No orders</p>
                ) : (
                  readyOrders.map(order => (
                    <CompactOrderCard
                      key={order.id}
                      order={order}
                      onUpdateStatus={updateOrderStatus}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Completed Orders View */}
      {activeTab === 'completed' && (
        <CompletedOrdersView orders={completedOrders} />
      )}

      {/* Products Management View */}
      {activeTab === 'products' && (
        <ProductManagementView 
          products={products}
          onToggleAvailability={toggleProductAvailability}
        />
      )}

      {/* Settings View */}
      {activeTab === 'settings' && (
        <StoreSettingsView store={selectedStore} />
      )}
    </div>
  );
};

const CompactOrderCard = ({ order, onUpdateStatus }) => {
  const [expanded, setExpanded] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const updateTimer = () => {
      setCurrentTime(new Date());
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 10000); // Update every 10 seconds
    
    return () => clearInterval(interval);
  }, [order.created_at]);

  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
  };

 const formatPickupTime = (time, createdAt) => {
    if (time === 'asap') {
      // Calculate 15 minutes after order creation
      const estimatedTime = new Date(new Date(createdAt).getTime() + 15 * 60 * 1000);
      return estimatedTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      });
    }
    return new Date(time).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  // Calculate order timeliness
  const getOrderTimeliness = () => {
    const now = currentTime;
    const createdAt = new Date(order.created_at);
    const secondsElapsed = Math.floor((now - createdAt) / 1000);
    const minsElapsed = Math.floor(secondsElapsed / 60);
    
    // Status-based timeliness for ASAP orders (15 min target)
    if (order.pickup_time === 'asap') {
      if (order.status === 'placed') {
        // Placed status: needs acknowledgment ASAP
        if (secondsElapsed < 30) return { color: 'bg-green-500', text: 'text-green-700', label: 'New Order', minutes: minsElapsed };
        if (secondsElapsed < 60) return { color: 'bg-yellow-500', text: 'text-yellow-700', label: 'Needs Attention', minutes: minsElapsed };
        return { color: 'bg-red-500', text: 'text-red-700', label: 'URGENT - Acknowledge!', minutes: minsElapsed };
      } else if (order.status === 'preparing') {
        // Preparing status: should be ready by 15 min from order placed
        if (minsElapsed < 12) return { color: 'bg-green-500', text: 'text-green-700', label: 'On Track', minutes: minsElapsed };
        if (minsElapsed < 15) return { color: 'bg-yellow-500', text: 'text-yellow-700', label: 'Almost Time', minutes: minsElapsed };
        return { color: 'bg-red-500', text: 'text-red-700', label: 'ORDER LATE!', minutes: minsElapsed };
      } else if (order.status === 'ready') {
        // Ready status: customer should pickup around 15 min mark
        if (minsElapsed < 20) return { color: 'bg-green-500', text: 'text-green-700', label: 'Ready', minutes: minsElapsed };
        if (minsElapsed < 30) return { color: 'bg-yellow-500', text: 'text-yellow-700', label: 'Customer Late', minutes: minsElapsed };
        return { color: 'bg-red-500', text: 'text-red-700', label: 'Call Customer', minutes: minsElapsed };
      } else {
        // For completed or any other status
        return { color: 'bg-gray-500', text: 'text-gray-700', label: 'Done', minutes: minsElapsed };
      }
    } else {
      // Scheduled orders
      const pickupTime = new Date(order.pickup_time);
      const minutesUntilPickup = Math.floor((pickupTime - now) / 1000 / 60);
      
      if (minutesUntilPickup > 15) return { color: 'bg-green-500', text: 'text-green-700', label: 'On Time', minutes: -minutesUntilPickup };
      if (minutesUntilPickup > 5) return { color: 'bg-yellow-500', text: 'text-yellow-700', label: 'Soon', minutes: -minutesUntilPickup };
      if (minutesUntilPickup > 0) return { color: 'bg-red-500', text: 'text-red-700', label: 'Due Now', minutes: -minutesUntilPickup };
      return { color: 'bg-red-600', text: 'text-red-800', label: 'LATE', minutes: -minutesUntilPickup };
    }
  };

  const timeliness = getOrderTimeliness();

  useEffect(() => {
    console.log('CompactOrderCard mounted/updated - Order:', order.id?.substring(0,8), 'Status:', order.status, 'Expanded:', expanded);
  }, [expanded, order.status, order.id]);

  if (!expanded) {
    return (
      <div 
                onClick={() => {
          console.log('Clicked completed order, current expanded state:', expanded, 'order status:', order.status);
          setExpanded(true);
          console.log('Set expanded to true');
        }}
         className="bg-white rounded-lg p-3 shadow-sm cursor-pointer hover:shadow-md hover:bg-blue-50 transition-shadow active:scale-95 transform relative"
        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
      >
        {/* Timeliness indicator dot */}
                {order.status !== 'completed' && (
          <div className={`absolute top-2 left-2 w-3 h-3 ${timeliness.color} rounded-full`}></div>
        )}
        
        <div className={`flex items-center justify-between mb-1.5 ${order.status !== 'completed' ? 'ml-5' : ''}`}>
          <span className="font-bold text-sm truncate mr-2">
            {order.profiles?.first_name} {order.profiles?.last_name?.charAt(0)}.
          </span>
          <span className="text-xs text-gray-600 font-medium bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap">
            {formatPickupTime(order.pickup_time, order.created_at)}
          </span>
        </div>
         <div className={`flex items-center justify-between text-xs text-gray-600 ${order.status !== 'completed' ? 'ml-5' : ''}`}>
          <span>{order.items.length} item{order.items.length !== 1 ? 's' : ''}</span>
          <span className="font-bold text-green-600">${order.total.toFixed(2)}</span>
        </div>
        {order.special_instructions && (
           <div className={`mt-1.5 text-xs text-yellow-700 bg-yellow-50 px-2 py-1 rounded ${order.status !== 'completed' ? 'ml-5' : ''}`}>
            📝 Special instructions
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <TabletStoreOrderCard 
        order={order} 
                onUpdateStatus={async (orderId, status) => {
          await onUpdateStatus(orderId, status);
          setExpanded(false);
        }}
        onCollapse={() => setExpanded(false)}
      />
    </div>
  );
};

const TabletStoreOrderCard = ({ order, onUpdateStatus, onCollapse }) => {
  const getStatusColor = (status) => {
    switch(status) {
      case 'placed': return 'bg-yellow-100 text-yellow-800';
      case 'preparing': return 'bg-blue-100 text-blue-800';
      case 'ready': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
  };

const formatPickupTime = (time, createdAt) => {
    if (time === 'asap') {
      // Calculate 15 minutes after order creation
      const estimatedTime = new Date(new Date(createdAt).getTime() + 15 * 60 * 1000);
      return estimatedTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      });
    }
    return new Date(time).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  // Calculate order timeliness with timer
// Calculate order timeliness with timer
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const updateTimer = () => {
      setCurrentTime(new Date());
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 10000); // Update every 10 seconds
    
    return () => clearInterval(interval);
  }, [order.created_at]);

  const getOrderTimeliness = () => {
    const now = currentTime;
    const createdAt = new Date(order.created_at);
    const secondsElapsed = Math.floor((now - createdAt) / 1000);
    const minsElapsed = Math.floor(secondsElapsed / 60);
    
    // Status-based timeliness for ASAP orders (15 min target)
    if (order.pickup_time === 'asap') {
      if (order.status === 'placed') {
        // Placed status: needs acknowledgment ASAP
        if (secondsElapsed < 30) return { color: 'bg-green-500', text: 'text-green-700', label: 'New Order', minutes: minsElapsed };
        if (secondsElapsed < 60) return { color: 'bg-yellow-500', text: 'text-yellow-700', label: 'Needs Attention', minutes: minsElapsed };
        return { color: 'bg-red-500', text: 'text-red-700', label: 'URGENT - Acknowledge!', minutes: minsElapsed };
      } else if (order.status === 'preparing') {
        // Preparing status: should be ready by 15 min from order placed
        if (minsElapsed < 12) return { color: 'bg-green-500', text: 'text-green-700', label: 'On Track', minutes: minsElapsed };
        if (minsElapsed < 15) return { color: 'bg-yellow-500', text: 'text-yellow-700', label: 'Almost Time', minutes: minsElapsed };
        return { color: 'bg-red-500', text: 'text-red-700', label: 'ORDER LATE!', minutes: minsElapsed };
      } else if (order.status === 'ready') {
        // Ready status: customer should pickup around 15 min mark
        if (minsElapsed < 20) return { color: 'bg-green-500', text: 'text-green-700', label: 'Ready', minutes: minsElapsed };
        if (minsElapsed < 30) return { color: 'bg-yellow-500', text: 'text-yellow-700', label: 'Customer Late', minutes: minsElapsed };
        return { color: 'bg-red-500', text: 'text-red-700', label: 'Call Customer', minutes: minsElapsed };
      } else {
        // For completed or any other status
        return { color: 'bg-gray-500', text: 'text-gray-700', label: 'Done', minutes: minsElapsed };
      }
    } else {
      // Scheduled orders
      const pickupTime = new Date(order.pickup_time);
      const minutesUntilPickup = Math.floor((pickupTime - now) / 1000 / 60);
      
      if (minutesUntilPickup > 15) return { color: 'bg-green-500', text: 'text-green-700', label: 'On Time', minutes: -minutesUntilPickup };
      if (minutesUntilPickup > 5) return { color: 'bg-yellow-500', text: 'text-yellow-700', label: 'Soon', minutes: -minutesUntilPickup };
      if (minutesUntilPickup > 0) return { color: 'bg-red-500', text: 'text-red-700', label: 'Due Now', minutes: -minutesUntilPickup };
      return { color: 'bg-red-600', text: 'text-red-800', label: 'LATE', minutes: -minutesUntilPickup };
    }
  };

  const timeliness = getOrderTimeliness();
  const minutesElapsed = Math.floor((currentTime - new Date(order.created_at)) / 1000 / 60);

  const StoreOrderItem = ({ item }) => {
    const [product, setProduct] = useState(null);

    useEffect(() => {
      if (item.image_url || !item.id) {
        setProduct(item);
        return;
      }
      
      const fetchProduct = async () => {
        const { data } = await supabase
          .from('products')
          .select('image_url, picture')
          .eq('id', item.id)
          .single();
        
        if (data) {
          setProduct({ ...item, ...data });
        } else {
          setProduct(item);
        }
      };
      
      fetchProduct();
    }, [item.id, item.image_url]);

    const displayProduct = product || item;

    return (
      <div className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
        <ProductImageDisplay 
          product={displayProduct} 
          size="small"
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-gray-900 truncate">{item.name}</p>
          {item.id && (
            <p className="text-xs text-gray-500 font-mono">ID: {item.id}</p>
          )}
          <p className="text-xs text-gray-600">Qty: {item.quantity}</p>
        </div>
        <span className="text-sm font-medium text-gray-900 whitespace-nowrap ml-2">
          ${(item.price * item.quantity).toFixed(2)}
        </span>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg p-3 shadow-lg relative">
      {/* Subtle collapse button - chevron up in top right */}
      <button
        onClick={onCollapse}
        className="absolute top-2 right-2 z-10 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="Collapse"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {/* Header with timeliness badge */}
      <div className="mb-3 pr-8">
        <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          {order.status !== 'completed' && (
            <div className={`w-3 h-3 ${timeliness.color} rounded-full`}></div>
          )}
          <div>
              <h3 className="font-bold text-base">
                {order.profiles?.first_name} {order.profiles?.last_name?.charAt(0)}.
              </h3>
              <p className="text-xs text-gray-600 mt-0.5">
                Order #{order.id.substring(0, 8).toUpperCase()}
              </p>
            </div>
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
            {order.status.toUpperCase()}
          </span>
        </div>
        
        {/* Timeliness info */}
        <div className="flex items-center gap-2 text-xs">
          <span className={`${timeliness.text} font-medium`}>{timeliness.label}</span>
          <span className="text-gray-500">•</span>
          <span className="text-gray-600">
            {order.pickup_time === 'asap' 
              ? `${minutesElapsed}m elapsed`
              : timeliness.minutes > 0 
                ? `${Math.abs(timeliness.minutes)}m until pickup`
                : `${Math.abs(timeliness.minutes)}m overdue`
            }
          </span>
        </div>
        
        <div className="flex gap-3 text-xs text-gray-600 mt-1">
          <span>Placed: {formatTime(order.created_at)}</span>
          <span className="font-medium text-gray-900">Pickup: {formatPickupTime(order.pickup_time, order.created_at)}</span>
        </div>
      </div>

      {/* Items */}
      <div className="mb-3 border-t pt-2">
        <h4 className="font-medium text-sm mb-2">Items:</h4>
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {order.items.map((item, idx) => (
            <StoreOrderItem key={idx} item={item} />
          ))}
        </div>
      </div>

      {/* Total */}
      <div className="border-t pt-2 mb-2">
        <div className="flex justify-between font-bold text-sm">
          <span>Total:</span>
          <span className="text-green-600">${order.total.toFixed(2)}</span>
        </div>
      </div>

      {/* Special Instructions */}
      {order.special_instructions && (
        <div className="bg-yellow-50 border border-yellow-200 p-2 rounded mb-2">
          <p className="text-xs font-medium text-yellow-900">Special Instructions:</p>
          <p className="text-sm text-yellow-800">{order.special_instructions}</p>
        </div>
      )}

      {/* Contact */}
      <a 
        href={`tel:${order.profiles?.mobile_number}`}
        className="text-blue-600 text-sm hover:underline block mb-3 py-1"
      >
        📞 {order.profiles?.mobile_number}
      </a>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {order.status === 'placed' && (
          <button
            onClick={() => onUpdateStatus(order.id, 'preparing')}
            className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 active:scale-95 transform transition-transform text-sm"
          >
            Start Preparing
          </button>
        )}
        {order.status === 'preparing' && (
          <button
            onClick={() => onUpdateStatus(order.id, 'ready')}
            className="flex-1 bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 active:scale-95 transform transition-transform text-sm"
          >
            Mark Ready
          </button>
        )}
        {order.status === 'ready' && (
          <button
            onClick={() => onUpdateStatus(order.id, 'completed')}
            className="flex-1 bg-gray-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-gray-700 active:scale-95 transform transition-transform text-sm"
          >
            Complete Order
          </button>
        )}
      </div>
    </div>
  );
};

const CompletedOrdersView = ({ orders }) => {
  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Completed Orders</h2>
      {orders.length === 0 ? (
        <div className="bg-white p-8 rounded-lg text-center">
          <p className="text-gray-600">No completed orders yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <CompactOrderCard
              key={order.id}
              order={order}
              onUpdateStatus={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ProductManagementView = ({ products, onToggleAvailability }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProducts = products.filter(p =>
    p.products?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Product Management</h2>
      
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search products..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-lg"
        />
      </div>

      <div className="space-y-2">
        {filteredProducts.length === 0 ? (
          <div className="bg-white p-8 rounded-lg text-center">
            <p className="text-gray-600">No products found</p>
          </div>
        ) : (
          filteredProducts.map(storeProduct => (
            <div
              key={storeProduct.id}
              className={`bg-white rounded-lg p-4 shadow flex items-center justify-between ${
                !storeProduct.available ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-center gap-3 flex-1">
                <ProductImageDisplay
                  product={storeProduct.products}
                  size="small"
                />
                <div className="flex-1">
                  <h3 className="font-medium">{storeProduct.products?.name}</h3>
                  <p className="text-sm text-gray-600">
                    ID: {storeProduct.product_id} • ${storeProduct.products?.price?.toFixed(2)}
                  </p>
                </div>
              </div>
              
              <button
                onClick={() => onToggleAvailability(storeProduct, storeProduct.available)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  storeProduct.available
                    ? 'bg-green-100 text-green-800 hover:bg-green-200'
                    : 'bg-red-100 text-red-800 hover:bg-red-200'
                }`}
              >
                {storeProduct.available ? '✓ In Stock' : '✕ Out of Stock'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const StoreSettingsView = ({ store }) => {
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Store Settings</h2>
      
      <div className="bg-white rounded-lg p-4 shadow space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Store Name</label>
          <input
            type="text"
            value={store?.name || ''}
            disabled
            className="w-full p-2 border border-gray-300 rounded bg-gray-50"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <input
            type="text"
            value={store?.address || ''}
            disabled
            className="w-full p-2 border border-gray-300 rounded bg-gray-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Manager Email</label>
          <input
            type="email"
            value={store?.manager_email || ''}
            disabled
            className="w-full p-2 border border-gray-300 rounded bg-gray-50"
          />
        </div>

        <p className="text-sm text-gray-600 mt-4">
          Contact your administrator to update store settings.
        </p>
      </div>
    </div>
  );
};
export default GasStationApp;