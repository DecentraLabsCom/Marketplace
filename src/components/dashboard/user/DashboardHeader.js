/**
 * Common dashboard header component
 * Displays the main title for user and provider dashboards
 */
import PropTypes from 'prop-types';

/**
 * Renders a dashboard header with title
 * @param {Object} props - Component props
 * @param {string} props.title - Header title to display
 * @param {string} [props.className] - Additional CSS classes
 * @returns {JSX.Element} Dashboard header component
 */
export default function DashboardHeader({ title, className = "" }) {
  return (
    <div className={`relative bg-cover bg-center text-white py-5 text-center ${className}`}>
      <h1 className="text-3xl font-bold mb-2">{title}</h1>
    </div>
  );
}

DashboardHeader.propTypes = {
  title: PropTypes.string.isRequired,
  className: PropTypes.string
};
