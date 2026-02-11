import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import InquiryForm from '@/app/components/InquiryForm';
import PriceWithCalculator from '@/app/components/PriceWithCalculator';
import InvestorCalculator from '@/app/components/InvestorCalculator';
import RentVsBuyCalculator from '@/app/components/RentVsBuyCalculator';
import listingsData from '@/data/listings.json';
import agentsData from '@/data/agents.json';
import type { Listing } from '@/lib/types/listing';
import IDXDisclaimer from '@/app/components/IDXDisclaimer';
import ListingHeroImage from '@/app/components/ListingHeroImage';

// ISR: revalidate every 15 min (matches cron sync interval)
export const revalidate = 900;

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const listing = (listingsData.listings as unknown as Listing[]).find((l) => l.id === id);

  if (!listing) {
    return { title: 'Listing Not Found | Mallan Real Estate' };
  }

  const isRental = listing.listingType === 'rent';
  const priceDisplay = isRental
    ? `$${listing.price.listPrice.toLocaleString()}/mo`
    : `$${listing.price.listPrice.toLocaleString()}`;
  const fullAddress = `${listing.address.streetNumber} ${listing.address.streetName} ${listing.address.unit}`;

  return {
    title: `${fullAddress} | ${priceDisplay} | Mallan Real Estate`,
    description: `${listing.propertyInfo.bedroomsTotal} bed, ${listing.propertyInfo.bathroomsFull} bath ${listing.propertyInfo.propertyType} in ${listing.address.neighborhoodDisplay}. ${listing.description.substring(0, 150)}...`,
  };
}

export function generateStaticParams() {
  return (listingsData.listings as unknown as Listing[]).map((listing) => ({
    id: listing.id,
  }));
}

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) {
    return `$${price.toLocaleString()}/mo`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

export default async function ListingPage({ params }: Props) {
  const { id } = await params;
  const listing = (listingsData.listings as unknown as Listing[]).find((l) => l.id === id);

  if (!listing) {
    notFound();
  }

  // IDX opt-out guard: if the listing owner has opted out of IDX display, block it
  if (listing.compliance?.idxOptOut) {
    return (
      <div className="min-h-screen bg-white font-sans">
        <Header dark />
        <div className="flex items-center justify-center min-h-[60vh] pt-20">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-semibold mb-4">Listing Not Available</h1>
            <p className="text-gray-600 mb-6">
              This listing is not available for online display. Please contact Mallan Real Estate for more information.
            </p>
            <Link href="/agents" className="inline-block px-6 py-3 bg-brand-dark text-white rounded hover:bg-gray-800 transition-colors">
              Contact an Agent
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const isRental = listing.listingType === 'rent';
  const isCoop = listing.propertyInfo.propertyType === 'Co-op';
  const isCondo = listing.propertyInfo.propertyType === 'Condo' || listing.propertyInfo.propertyType === 'Condop';
  const fullAddress = `${listing.address.streetNumber} ${listing.address.streetName}, ${listing.address.unit}`;

  // Collect building amenities
  const buildingAmenities = [];
  if (listing.features.building.doorman) buildingAmenities.push(`${listing.features.building.doormanType || ''} Doorman`.trim());
  if (listing.features.building.concierge) buildingAmenities.push('Concierge');
  if (listing.features.building.elevator) buildingAmenities.push('Elevator');
  if (listing.features.building.gym) buildingAmenities.push('Fitness Center');
  if (listing.features.building.pool) buildingAmenities.push('Pool');
  if (listing.features.building.roofDeck) buildingAmenities.push('Roof Deck');
  if (listing.features.building.garage) buildingAmenities.push(`Parking (${listing.features.building.parkingType})`);
  if (listing.features.building.storage) buildingAmenities.push('Storage');
  if (listing.features.building.bikeRoom) buildingAmenities.push('Bike Room');
  if (listing.features.building.laundryRoom) buildingAmenities.push('Laundry Room');
  if (listing.features.building.playroom) buildingAmenities.push('Playroom');
  if (listing.features.building.communityRoom) buildingAmenities.push('Community Room');

  // Collect unit features
  const unitFeatures = [];
  if (listing.features.interior.laundry === 'In Unit') unitFeatures.push('In-Unit Washer/Dryer');
  if (listing.features.interior.fireplace) unitFeatures.push('Fireplace');
  if (listing.features.outdoor.balcony) unitFeatures.push('Balcony');
  if (listing.features.outdoor.terrace) unitFeatures.push('Terrace');
  if (listing.features.outdoor.garden) unitFeatures.push('Private Garden');
  if (listing.features.outdoor.roofRights) unitFeatures.push('Roof Rights');

  return (
    <div className="min-h-screen bg-white font-sans">
      <Header dark />

      {/* Breadcrumb */}
      <div className="bg-white border-b pt-20">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/" className="hover:text-brand-gold">Home</Link>
            <span>/</span>
            <Link href={isRental ? '/rent' : '/buy'} className="hover:text-brand-gold">
              {isRental ? 'Rentals' : 'Sales'}
            </Link>
            <span>/</span>
            <Link href={`/neighborhoods/${listing.address.neighborhood}`} className="hover:text-brand-gold">
              {listing.address.neighborhoodDisplay}
            </Link>
            <span>/</span>
            <span className="text-gray-800">{listing.address.streetNumber} {listing.address.streetName}</span>
          </nav>
        </div>
      </div>

      {/* Image Gallery */}
      <ListingHeroImage
        src={listing.media.images[0]?.url || '/images/listing-placeholder.svg'}
        alt={fullAddress}
      >
        {listing.flags.isExclusive && (
          <div className="absolute top-4 left-4 px-4 py-2 bg-brand-gold text-white text-sm uppercase tracking-wide rounded">
            Mallan Exclusive
          </div>
        )}
        {listing.flags.isPriceReduced && (
          <div className="absolute top-4 left-4 mt-12 px-4 py-2 bg-green-600 text-white text-sm rounded">
            Price Reduced
          </div>
        )}
        {listing.openHouse?.scheduled && (
          <div className="absolute top-4 right-4 px-4 py-2 bg-white text-brand-dark text-sm rounded shadow">
            Open House: {formatDate(listing.openHouse.date).split(',')[0]}
          </div>
        )}
      </ListingHeroImage>

      <main className="py-8 md:py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-8 lg:gap-12">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-8">
              {/* Header */}
              <div>
                <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                  <div>
                    <PriceWithCalculator
                      price={listing.price.listPrice}
                      originalPrice={listing.price.originalListPrice}
                      isRental={isRental}
                      maintenanceFee={listing.nycSpecific?.maintenanceFee || 0}
                      monthlyTaxes={listing.nycSpecific?.realEstateTaxes || 0}
                      propertyType={listing.propertyInfo.propertyType}
                    />
                    <p className="text-xl text-gray-700 mt-2">{fullAddress}</p>
                    <p className="text-gray-500">
                      {listing.address.neighborhoodDisplay}, {listing.address.borough}, NY {listing.address.zip}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded">
                      {listing.propertyInfo.propertyType}
                    </span>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="flex flex-wrap gap-6 py-4 border-y">
                  <div>
                    <span className="text-xl font-semibold">{listing.propertyInfo.bedroomsTotal}</span>
                    <span className="text-gray-500 ml-1">Beds</span>
                  </div>
                  <div>
                    <span className="text-xl font-semibold">
                      {listing.propertyInfo.bathroomsFull}
                      {listing.propertyInfo.bathroomsHalf > 0 && `.${listing.propertyInfo.bathroomsHalf}`}
                    </span>
                    <span className="text-gray-500 ml-1">Baths</span>
                  </div>
                  <div>
                    <span className="text-xl font-semibold">{listing.propertyInfo.aboveGradeFinishedArea.toLocaleString()}</span>
                    <span className="text-gray-500 ml-1">Sq Ft</span>
                  </div>
                  {listing.price.pricePerSqft && (
                    <div>
                      <span className="text-xl font-semibold">${listing.price.pricePerSqft.toLocaleString()}</span>
                      <span className="text-gray-500 ml-1">/Sq Ft</span>
                    </div>
                  )}
                  <div>
                    <span className="text-xl font-semibold">{listing.propertyInfo.totalRooms}</span>
                    <span className="text-gray-500 ml-1">Rooms</span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <section>
                <h2 className="text-xl font-sans mb-4">About This Property</h2>
                <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                  {listing.description}
                </p>
              </section>

              {/* NYC-Specific Info (Co-op/Condo) */}
              {!isRental && (isCoop || isCondo) && (
                <section className="bg-white rounded-lg p-6 border">
                  <h2 className="text-xl font-sans mb-4">
                    {isCoop ? 'Co-op Information' : 'Condo Information'}
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {listing.nycSpecific.maintenanceFee && (
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-gray-500">{isCoop ? 'Maintenance' : 'Common Charges'}</span>
                        <span className="font-medium">${listing.nycSpecific.maintenanceFee.toLocaleString()}/mo</span>
                      </div>
                    )}
                    {listing.nycSpecific.realEstateTaxes && (
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-gray-500">Real Estate Taxes</span>
                        <span className="font-medium">${listing.nycSpecific.realEstateTaxes.toLocaleString()}/mo</span>
                      </div>
                    )}
                    {listing.nycSpecific.taxesAnnual && (
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-gray-500">Annual Taxes</span>
                        <span className="font-medium">${listing.nycSpecific.taxesAnnual.toLocaleString()}</span>
                      </div>
                    )}
                    {listing.nycSpecific.flipTax !== null && (
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-gray-500">Flip Tax</span>
                        <span className="font-medium">
                          {listing.nycSpecific.flipTax
                            ? `${listing.nycSpecific.flipTaxPercent}% of sale price`
                            : 'None'}
                        </span>
                      </div>
                    )}
                    {listing.nycSpecific.maxFinancing !== null && (
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-gray-500">Max Financing</span>
                        <span className="font-medium">{listing.nycSpecific.maxFinancing}%</span>
                      </div>
                    )}
                    {listing.nycSpecific.sublettingAllowed !== null && (
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-gray-500">Subletting</span>
                        <span className="font-medium">
                          {listing.nycSpecific.sublettingAllowed
                            ? listing.nycSpecific.sublettingRestrictions || 'Allowed'
                            : 'Not Permitted'}
                        </span>
                      </div>
                    )}
                    {listing.nycSpecific.piedATerre !== null && (
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-gray-500">Pied-a-Terre</span>
                        <span className="font-medium">{listing.nycSpecific.piedATerre ? 'Allowed' : 'Not Allowed'}</span>
                      </div>
                    )}
                    {listing.nycSpecific.guarantorsAllowed !== null && (
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-gray-500">Guarantors</span>
                        <span className="font-medium">{listing.nycSpecific.guarantorsAllowed ? 'Allowed' : 'Not Allowed'}</span>
                      </div>
                    )}
                    {listing.nycSpecific.boardApprovalRequired !== null && (
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-gray-500">Board Approval</span>
                        <span className="font-medium">{listing.nycSpecific.boardApprovalRequired ? 'Required' : 'Not Required'}</span>
                      </div>
                    )}
                  </div>
                  {listing.association.associationFeeIncludes && listing.association.associationFeeIncludes.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm text-gray-500 mb-2">
                        {isCoop ? 'Maintenance' : 'Common Charges'} includes:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {listing.association.associationFeeIncludes.map((item) => (
                          <span key={item} className="px-3 py-1 bg-gray-100 rounded-full text-sm">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Property Details */}
              <section>
                <h2 className="text-xl font-sans mb-4">Property Details</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-500">Property Type</span>
                    <span className="font-medium">{listing.propertyInfo.propertyType}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-500">Building Type</span>
                    <span className="font-medium">{listing.propertyInfo.buildingType}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-500">Year Built</span>
                    <span className="font-medium">{listing.propertyInfo.yearBuilt}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-500">Floor</span>
                    <span className="font-medium">{listing.propertyInfo.unitFloor} of {listing.propertyInfo.floorsInBuilding}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-500">Exposure</span>
                    <span className="font-medium">{listing.features.exposure.join(', ')}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-500">Views</span>
                    <span className="font-medium">{listing.features.views.join(', ')}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-500">Days on Market</span>
                    <span className="font-medium">{listing.listing.daysOnMarket}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-500">MLS #</span>
                    <span className="font-medium">{listing.mlsId}</span>
                  </div>
                </div>
              </section>

              {/* Interior Features */}
              <section>
                <h2 className="text-xl font-sans mb-4">Interior Features</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-500">Flooring</span>
                    <span className="font-medium">{listing.features.interior.flooring.join(', ')}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-500">Laundry</span>
                    <span className="font-medium">{listing.features.interior.laundry}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-500">Heating</span>
                    <span className="font-medium">{listing.features.interior.heating.join(', ')}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-500">Cooling</span>
                    <span className="font-medium">{listing.features.interior.cooling.join(', ')}</span>
                  </div>
                </div>
                {listing.features.interior.appliances.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-500 mb-2">Appliances:</p>
                    <div className="flex flex-wrap gap-2">
                      {listing.features.interior.appliances.map((appliance) => (
                        <span key={appliance} className="px-3 py-1 bg-gray-100 rounded-full text-sm">
                          {appliance}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Building Amenities */}
              {buildingAmenities.length > 0 && (
                <section>
                  <h2 className="text-xl font-sans mb-4">Building Amenities</h2>
                  <div className="flex flex-wrap gap-3">
                    {buildingAmenities.map((amenity) => (
                      <span key={amenity} className="px-4 py-2 bg-gray-100 rounded-full text-sm">
                        {amenity}
                      </span>
                    ))}
                  </div>
                  {listing.features.building.security.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm text-gray-500 mb-2">Security Features:</p>
                      <div className="flex flex-wrap gap-2">
                        {listing.features.building.security.map((item) => (
                          <span key={item} className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Pets Policy */}
              <section className="bg-white rounded-lg p-6 border">
                <h2 className="text-xl font-sans mb-4">Pet Policy</h2>
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    listing.features.pets.allowed ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                  }`}>
                    {listing.features.pets.allowed ? (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-lg">{listing.features.pets.policy}</p>
                    {listing.features.pets.comments && (
                      <p className="text-gray-600 mt-1">{listing.features.pets.comments}</p>
                    )}
                  </div>
                </div>
              </section>

              {/* Open House */}
              {listing.openHouse?.scheduled && (
                <section className="bg-brand-gold/10 rounded-lg p-6">
                  <h2 className="text-xl font-sans mb-2">Open House</h2>
                  <p className="text-lg">{formatDate(listing.openHouse.date)}</p>
                  <p className="text-gray-600">
                    {formatTime(listing.openHouse.startTime)} - {formatTime(listing.openHouse.endTime)}
                  </p>
                  {listing.openHouse.remarks && (
                    <p className="text-sm text-gray-500 mt-2">{listing.openHouse.remarks}</p>
                  )}
                </section>
              )}

              {/* Neighborhood Link */}
              <section className="bg-white rounded-lg p-6 border">
                <h2 className="text-xl font-sans mb-2">About {listing.address.neighborhoodDisplay}</h2>
                <p className="text-gray-600 mb-4">
                  Learn more about the neighborhood, local attractions, schools, and dining options.
                </p>
                <Link
                  href={`/neighborhoods/${listing.address.neighborhood}`}
                  className="inline-block text-brand-gold hover:underline"
                >
                  Explore {listing.address.neighborhoodDisplay}
                </Link>
              </section>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                {/* Contact Card */}
                <div className="bg-white rounded-lg p-6 border shadow-sm">
                  <h3 className="text-lg font-sans mb-4">Interested in this property?</h3>

                  <div className="mb-6">
                    <p className="text-sm text-gray-500 mb-1">Listed by</p>
                    {listing.compliance?.vowOptOut ? (
                      <>
                        <p className="font-medium text-lg">{listing.agent.listOfficeName}</p>
                        <p className="text-sm text-gray-500 mt-2">
                          Contact Mallan Real Estate for inquiries about this listing.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-lg">{listing.agent.listAgentName}</p>
                        <p className="text-sm text-gray-500">
                          {agentsData.agents.find(a => a.name === listing.agent.listAgentName)?.title || 'Licensed Real Estate Salesperson'}
                        </p>
                        <p className="text-gray-600">{listing.agent.listOfficeName}</p>
                        <div className="mt-3 pt-3 border-t space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            <a href={`tel:${listing.agent.listAgentPhone}`} className="text-gray-700 hover:text-brand-gold">
                              {listing.agent.listAgentPhone}
                            </a>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            <a href={`mailto:${listing.agent.listAgentEmail}?subject=Inquiry about ${fullAddress}`} className="text-gray-700 hover:text-brand-gold break-all">
                              {listing.agent.listAgentEmail}
                            </a>
                          </div>
                        </div>
                      </>
                    )}
                    {/* Agent Compensation */}
                    {listing.buyer?.buyerAgentCompensation && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">{isRental ? 'Tenant' : 'Buyer'}&apos;s Agent Compensation</span>
                          <span className="font-medium text-gray-700">{listing.buyer.buyerAgentCompensation}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {listing.compliance?.vowOptOut ? (
                      <a
                        href="tel:646-258-4460"
                        className="block w-full text-center px-6 py-3 bg-brand-dark text-white rounded hover:bg-gray-800 transition-colors"
                      >
                        Contact Mallan Real Estate
                      </a>
                    ) : (
                      <>
                        <a
                          href={`tel:${listing.agent.listAgentPhone}`}
                          className="block w-full text-center px-6 py-3 bg-brand-dark text-white rounded hover:bg-gray-800 transition-colors"
                        >
                          Call Agent
                        </a>
                        <a
                          href={`mailto:${listing.agent.listAgentEmail}?subject=Inquiry about ${fullAddress}`}
                          className="block w-full text-center px-6 py-3 border border-brand-dark text-brand-dark rounded hover:bg-gray-50 transition-colors"
                        >
                          Email Agent
                        </a>
                      </>
                    )}
                  </div>
                </div>

                {/* Inquiry Form */}
                <InquiryForm
                  listingId={listing.id}
                  listingAddress={fullAddress}
                  agentEmail={listing.agent.listAgentEmail}
                />

                {/* Calculators */}
                {!isRental && (
                  /* Investor Calculator for Sales */
                  <InvestorCalculator
                    purchasePrice={listing.price.listPrice}
                    maintenanceFee={listing.nycSpecific?.maintenanceFee || 0}
                    monthlyTaxes={listing.nycSpecific?.realEstateTaxes || 0}
                    bedrooms={listing.propertyInfo.bedroomsTotal}
                    neighborhood={listing.address.neighborhoodDisplay}
                  />
                )}

                {isRental && (
                  /* Rent vs Buy Calculator for Rentals */
                  <RentVsBuyCalculator
                    purchasePrice={listing.price.listPrice * 250}
                    monthlyRent={listing.price.listPrice}
                    maintenanceFee={0}
                    realEstateTaxes={0}
                    isRental={true}
                  />
                )}

                {/* Similar Listings */}
                <div className="bg-white rounded-lg p-6 border">
                  <h3 className="text-lg font-sans mb-4">Similar Properties</h3>
                  <div className="space-y-4">
                    {(listingsData.listings as unknown as Listing[])
                      .filter(
                        (l) =>
                          l.id !== listing.id &&
                          l.listingType === listing.listingType &&
                          l.status === 'active'
                      )
                      .slice(0, 3)
                      .map((similarListing) => (
                        <Link
                          key={similarListing.id}
                          href={`/listing/${similarListing.id}`}
                          className="block hover:bg-gray-50 rounded p-2 -mx-2 transition-colors"
                        >
                          <p className="font-medium text-gray-800">
                            {formatPrice(similarListing.price.listPrice, isRental)}
                          </p>
                          <p className="text-sm text-gray-600">
                            {similarListing.address.streetNumber} {similarListing.address.streetName}
                          </p>
                          <p className="text-xs text-gray-400">
                            {similarListing.propertyInfo.bedroomsTotal} bed, {similarListing.propertyInfo.bathroomsFull} bath
                          </p>
                        </Link>
                      ))}
                  </div>
                  <Link
                    href={isRental ? '/rent' : '/buy'}
                    className="inline-block mt-4 text-sm text-gray-500 hover:text-brand-gold"
                  >
                    View all {isRental ? 'rentals' : 'sales'}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* REBNY RLS Disclaimer */}
      <section className="bg-white border-t py-6 px-4">
        <div className="max-w-7xl mx-auto">
          <IDXDisclaimer
            variant="full"
            lastUpdated={listing.listing.modificationTimestamp}
          />
        </div>
      </section>

      <Footer />
    </div>
  );
}
