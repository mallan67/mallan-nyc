'use client';

import { useState } from 'react';
import Link from 'next/link';
import Header from '../components/Header';
import Footer from '../components/Footer';

/**
 * Contact Page - TCPA-Safe Implementation
 *
 * Compliance requirements:
 * - Explicit opt-in consent checkbox (not pre-checked)
 * - Clear disclosure of what contact means
 * - No autoresponders or SMS
 * - Minimal data collection
 * - Fair Housing compliant language
 */

interface FormData {
  name: string;
  email: string;
  phone: string;
  message: string;
  consent: boolean;
}

interface FormErrors {
  name?: string;
  email?: string;
  message?: string;
  consent?: string;
}

export default function ContactPage() {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    message: '',
    consent: false,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.length > 100) {
      newErrors.name = 'Name must be less than 100 characters';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.message.trim()) {
      newErrors.message = 'Message is required';
    } else if (formData.message.length > 2000) {
      newErrors.message = 'Message must be less than 2000 characters';
    }

    if (!formData.consent) {
      newErrors.consent = 'You must consent to be contacted';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim() || undefined,
          message: formData.message.trim(),
          consentTimestamp: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        setSubmitStatus('success');
        setFormData({ name: '', email: '', phone: '', message: '', consent: false });
      } else {
        setSubmitStatus('error');
      }
    } catch {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));

    // Clear error when user starts typing
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  return (
    <>
      <Header dark />
      <main id="main-content" className="min-h-screen bg-white pt-20">
        {/* Hero */}
        <section className="bg-brand-dark text-white py-16 md:py-20">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h1 className="text-xl md:text-2xl font-sans font-medium mb-4">
              Contact Us
            </h1>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              Questions about buying, selling, or renting in NYC? We&apos;re here to help.
            </p>
          </div>
        </section>

        {/* Contact Form Section */}
        <section className="py-12 md:py-16">
          <div className="max-w-4xl mx-auto px-4">
            <div className="grid md:grid-cols-5 gap-12">
              {/* Form */}
              <div className="md:col-span-3">
                {submitStatus === 'success' ? (
                  <div
                    className="bg-green-50 border border-green-200 rounded-lg p-8 text-center"
                    role="status"
                    aria-live="polite"
                  >
                    <svg
                      className="w-16 h-16 text-green-500 mx-auto mb-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <h2 className="text-xl font-sans font-medium text-gray-900 mb-3">
                      Thank You
                    </h2>
                    <p className="text-gray-600 mb-2">
                      Your message has been received.
                    </p>
                    <div className="bg-white rounded-lg p-4 my-6 text-left border border-green-100">
                      <h3 className="text-sm font-medium text-gray-800 mb-2">What happens next:</h3>
                      <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                        <li>We review your inquiry within 24 hours</li>
                        <li>A licensed agent will respond via email</li>
                        <li>No automated calls or texts—just a real person</li>
                      </ol>
                    </div>
                    <div className="border-t border-green-200 pt-6">
                      <p className="text-sm text-gray-500 mb-4">
                        Need to speak with someone now?
                      </p>
                      <a
                        href="tel:+16462584460"
                        data-analytics-cta="cta_phone_success"
                        className="inline-block px-6 py-2 border border-gray-300 text-gray-700 font-medium rounded hover:bg-gray-100 transition-colors text-sm"
                      >
                        Call (646) 258-4460
                      </a>
                    </div>
                    <button
                      onClick={() => setSubmitStatus('idle')}
                      className="mt-6 text-sm text-brand-gold hover:underline"
                    >
                      Send another message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} noValidate>
                    <div className="space-y-6">
                      {/* Name */}
                      <div>
                        <label
                          htmlFor="name"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          id="name"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-brand-gold focus:border-transparent ${
                            errors.name ? 'border-red-500' : 'border-gray-300'
                          }`}
                          aria-describedby={errors.name ? 'name-error' : undefined}
                        />
                        {errors.name && (
                          <p id="name-error" className="mt-1 text-sm text-red-500">
                            {errors.name}
                          </p>
                        )}
                      </div>

                      {/* Email */}
                      <div>
                        <label
                          htmlFor="email"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Email <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          id="email"
                          name="email"
                          value={formData.email}
                          onChange={handleChange}
                          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-brand-gold focus:border-transparent ${
                            errors.email ? 'border-red-500' : 'border-gray-300'
                          }`}
                          aria-describedby={errors.email ? 'email-error' : undefined}
                        />
                        {errors.email && (
                          <p id="email-error" className="mt-1 text-sm text-red-500">
                            {errors.email}
                          </p>
                        )}
                      </div>

                      {/* Phone (Optional) */}
                      <div>
                        <label
                          htmlFor="phone"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Phone <span className="text-gray-400">(optional)</span>
                        </label>
                        <input
                          type="tel"
                          id="phone"
                          name="phone"
                          value={formData.phone}
                          onChange={handleChange}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-gold focus:border-transparent"
                        />
                      </div>

                      {/* Message */}
                      <div>
                        <label
                          htmlFor="message"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Message <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          id="message"
                          name="message"
                          rows={5}
                          value={formData.message}
                          onChange={handleChange}
                          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-brand-gold focus:border-transparent resize-none ${
                            errors.message ? 'border-red-500' : 'border-gray-300'
                          }`}
                          aria-describedby={errors.message ? 'message-error' : undefined}
                        />
                        {errors.message && (
                          <p id="message-error" className="mt-1 text-sm text-red-500">
                            {errors.message}
                          </p>
                        )}
                      </div>

                      {/* Consent Checkbox - TCPA Compliance */}
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex items-start">
                          <input
                            type="checkbox"
                            id="consent"
                            name="consent"
                            checked={formData.consent}
                            onChange={handleChange}
                            className="mt-1 h-4 w-4 text-brand-gold border-gray-300 rounded focus:ring-brand-gold"
                            aria-describedby={errors.consent ? 'consent-error' : 'consent-description'}
                          />
                          <label
                            htmlFor="consent"
                            className="ml-3 text-sm text-gray-600"
                            id="consent-description"
                          >
                            <span className="font-medium text-gray-700">
                              I consent to be contacted
                            </span>{' '}
                            by Mallan Real Estate Inc. regarding my inquiry via email.
                            I understand that I am not required to provide consent as a
                            condition of purchasing any property or services.
                          </label>
                        </div>
                        {errors.consent && (
                          <p id="consent-error" className="mt-2 text-sm text-red-500 ml-7">
                            {errors.consent}
                          </p>
                        )}
                      </div>

                      {/* Submit Button */}
                      <div>
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          data-analytics-cta="contact_form"
                          className="w-full px-6 py-3 bg-brand-dark text-white font-medium rounded-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSubmitting ? 'Sending...' : 'Send Message'}
                        </button>
                      </div>

                      {submitStatus === 'error' && (
                        <p className="text-sm text-red-500 text-center">
                          Something went wrong. Please try again or call us directly.
                        </p>
                      )}
                    </div>
                  </form>
                )}
              </div>

              {/* Contact Info Sidebar */}
              <div className="md:col-span-2">
                <div className="bg-gray-50 rounded-lg p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">
                    Other Ways to Reach Us
                  </h2>

                  <div className="space-y-4">
                    {/* Phone */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-1">Phone</h3>
                      <a
                        href="tel:+16462584460"
                        data-analytics-cta="phone_call"
                        className="text-brand-gold hover:underline"
                      >
                        (646) 258-4460
                      </a>
                    </div>

                    {/* Email */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-1">Email</h3>
                      <a
                        href="mailto:info@mallan.nyc"
                        data-analytics-cta="email_agent"
                        className="text-brand-gold hover:underline"
                      >
                        info@mallan.nyc
                      </a>
                    </div>

                    {/* Office */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-1">Office</h3>
                      <p className="text-gray-600 text-sm">
                        400 East 90th Street, Suite 17C<br />
                        New York, NY 10128
                      </p>
                    </div>

                    {/* Hours */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-1">Hours</h3>
                      <p className="text-gray-600 text-sm">
                        Mon-Fri: 9am - 6pm<br />
                        Sat-Sun: 10am - 4pm
                      </p>
                    </div>
                  </div>
                </div>

                {/* License Info */}
                <div className="mt-6 text-center">
                  <p className="text-xs text-gray-500">
                    Licensed Real Estate Broker<br />
                    NY License #10991205323
                  </p>
                  <Link
                    href="/fair-housing"
                    className="text-xs text-brand-gold hover:underline mt-2 inline-block"
                  >
                    Fair Housing Policy
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
